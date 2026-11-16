package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestBudgetWindow(t *testing.T) {
	on := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC) // Sunday
	start, end := budgetWindow("weekly", on)
	if start.Format("2006-01-02") != "2026-10-26" || end.Format("2006-01-02") != "2026-11-02" {
		t.Fatalf("weekly window: %s to %s", start, end)
	}
	start, end = budgetWindow("monthly", on)
	if start.Format("2006-01-02") != "2026-11-01" || end.Format("2006-01-02") != "2026-12-01" {
		t.Fatalf("monthly window: %s to %s", start, end)
	}
}

func TestBudgetAPIIntegration(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to an isolated PostgreSQL database")
	}
	if err := runMigrations(dsn); err != nil {
		t.Fatal(err)
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	pool, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	tx := db.Begin()
	if tx.Error != nil {
		t.Fatal(tx.Error)
	}
	defer tx.Rollback()
	owner, other := uuid.NewString(), uuid.NewString()
	parent, child, income := uuid.NewString(), uuid.NewString(), uuid.NewString()
	for _, id := range []string{owner, other} {
		if err := tx.Exec("INSERT INTO users (id,email,password_hash) VALUES (?,?,?)", id, id+"@example.test", "test").Error; err != nil {
			t.Fatal(err)
		}
	}
	for _, category := range []struct {
		id, name, kind string
		parent         *string
	}{{parent, "Food", "expense", nil}, {child, "Groceries", "expense", &parent}, {income, "Salary", "income", nil}} {
		if err := tx.Exec("INSERT INTO categories (id,user_id,parent_id,name,kind) VALUES (?,?,?,?,?)", category.id, owner, category.parent, category.name, category.kind).Error; err != nil {
			t.Fatal(err)
		}
	}
	for _, record := range []struct {
		category, kind, date string
		amount               int
		deleted              bool
	}{
		{parent, "expense", "2026-11-16", 40, false}, {child, "expense", "2026-11-16", 30, false},
		{child, "expense", "2026-11-08", 90, false}, {child, "income", "2026-11-16", 500, false},
		{child, "expense", "2026-11-16", 80, true},
	} {
		var deleted interface{}
		if record.deleted {
			deleted = time.Now().UTC()
		}
		if err := tx.Exec("INSERT INTO transactions (id,user_id,category_id,kind,amount,transaction_date,deleted_at) VALUES (?,?,?,?,?,?,?)", uuid.NewString(), owner, record.category, record.kind, record.amount, record.date, deleted).Error; err != nil {
			t.Fatal(err)
		}
	}
	gin.SetMode(gin.TestMode)
	r := gin.New()
	auth := r.Group("/api")
	auth.Use(func(c *gin.Context) {
		c.Set("auth", authContext{UserID: c.GetHeader("Test-User")})
		c.Set("csrf_hash", secretHash("test"))
		c.Next()
	})
	registerBudgetRoutes(auth, tx, "http://test")
	request := func(method, path, body, user string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Test-User", user)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Origin", "http://test")
		req.Header.Set("X-CSRF-Token", "test")
		req.AddCookie(&http.Cookie{Name: csrfCookieName, Value: "test"})
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}
	for _, category := range []string{income, uuid.NewString()} {
		if w := request("POST", "/api/budgets", fmt.Sprintf(`{"categoryId":%q,"amount":100,"period":"weekly"}`, category), owner); w.Code != 400 {
			t.Fatalf("invalid category status %d", w.Code)
		}
	}
	for _, amount := range []string{"0", "1.5", "9007199254740992"} {
		if w := request("POST", "/api/budgets", fmt.Sprintf(`{"categoryId":%q,"amount":%s,"period":"weekly"}`, parent, amount), owner); w.Code != 400 {
			t.Fatalf("invalid amount status %d", w.Code)
		}
	}
	create := func(category, period string) string {
		w := request("POST", "/api/budgets", fmt.Sprintf(`{"categoryId":%q,"amount":100,"period":%q}`, category, period), owner)
		if w.Code != 201 {
			t.Fatalf("create status %d: %s", w.Code, w.Body.String())
		}
		var result struct {
			Budget budgetRow `json:"budget"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		return result.Budget.ID
	}
	parentID := create(parent, "weekly")
	childID := create(child, "weekly")
	create(parent, "monthly")
	if w := request("POST", "/api/budgets", fmt.Sprintf(`{"categoryId":%q,"amount":100,"period":"weekly"}`, parent), owner); w.Code != 409 {
		t.Fatalf("duplicate status %d", w.Code)
	}
	if w := request("GET", "/api/budgets?on=2026-11-16", "", other); w.Code != 200 || !strings.Contains(w.Body.String(), `"budgets":[]`) {
		t.Fatalf("other user list: %d %s", w.Code, w.Body.String())
	}
	w := request("GET", "/api/budgets?on=2026-11-16", "", owner)
	if w.Code != 200 {
		t.Fatalf("list status %d: %s", w.Code, w.Body.String())
	}
	var result struct {
		Budgets []budgetView `json:"budgets"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Budgets) != 3 {
		t.Fatalf("got %d budgets", len(result.Budgets))
	}
	for _, b := range result.Budgets {
		if b.ID == parentID && (b.Spent != 70 || b.PeriodStart != "2026-11-16" || b.PeriodEnd != "2026-11-22") {
			t.Fatalf("parent weekly: %+v", b)
		}
		if b.ID == childID && b.Spent != 30 {
			t.Fatalf("child weekly: %+v", b)
		}
		if b.CategoryID == parent && b.Period == "monthly" && b.Spent != 160 {
			t.Fatalf("parent monthly: %+v", b)
		}
	}
	if w := request("PUT", "/api/budgets/"+parentID, fmt.Sprintf(`{"categoryId":%q,"amount":150,"period":"weekly"}`, parent), other); w.Code != 404 {
		t.Fatalf("cross-user update status %d", w.Code)
	}
	if w := request("DELETE", "/api/budgets/"+parentID, "{}", other); w.Code != 404 {
		t.Fatalf("cross-user delete status %d", w.Code)
	}
	if w := request("PUT", "/api/budgets/"+parentID, fmt.Sprintf(`{"categoryId":%q,"amount":150,"period":"weekly"}`, parent), owner); w.Code != 200 {
		t.Fatalf("update status %d", w.Code)
	}
	if w := request("PUT", "/api/budgets/"+childID, fmt.Sprintf(`{"categoryId":%q,"amount":100,"period":"weekly"}`, parent), owner); w.Code != 409 {
		t.Fatalf("conflicting update status %d", w.Code)
	}
	if w := request("PUT", "/api/budgets/"+childID, fmt.Sprintf(`{"categoryId":%q,"amount":100,"period":"monthly"}`, child), owner); w.Code != 200 {
		t.Fatalf("period update status %d", w.Code)
	}
	if w := request("DELETE", "/api/budgets/"+parentID, "{}", owner); w.Code != 204 {
		t.Fatalf("delete status %d", w.Code)
	}
	create(parent, "weekly") // A soft-deleted budget does not block a new one.
}
