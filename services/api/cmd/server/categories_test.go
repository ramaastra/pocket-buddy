package main

import (
	"encoding/json"
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestCategoriesIntegration(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL")
	}
	if err := runMigrations(dsn); err != nil {
		t.Fatal(err)
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	pool, _ := db.DB()
	defer pool.Close()
	tx := db.Begin()
	defer tx.Rollback()
	a, b := uuid.NewString(), uuid.NewString()
	for _, id := range []string{a, b} {
		if err := tx.Exec("INSERT INTO users (id,email,password_hash) VALUES (?,?,?)", id, id+"@example.test", "test").Error; err != nil {
			t.Fatal(err)
		}
	}
	gin.SetMode(gin.TestMode)
	r := gin.New()
	g := r.Group("/api")
	g.Use(func(c *gin.Context) {
		c.Set("auth", authContext{UserID: c.GetHeader("Test-User")})
		c.Set("csrf_hash", secretHash("test"))
		c.Next()
	})
	registerCategoryRoutes(g, tx, "http://test")
	registerTransactionRoutes(g, tx, "http://test")
	req := func(method, path, body, user string) *httptest.ResponseRecorder {
		q := httptest.NewRequest(method, path, strings.NewReader(body))
		q.Header.Set("Test-User", user)
		q.Header.Set("Content-Type", "application/json")
		q.Header.Set("Origin", "http://test")
		q.Header.Set("X-CSRF-Token", "test")
		q.AddCookie(&http.Cookie{Name: csrfCookieName, Value: "test"})
		w := httptest.NewRecorder()
		r.ServeHTTP(w, q)
		return w
	}
	create := func(name, parent, user string) string {
		t.Helper()
		w := req("POST", "/api/categories", fmt.Sprintf(`{"name":%q,"kind":"expense","parentId":%s}`, name, parent), user)
		if w.Code != 201 {
			t.Fatalf("create: %d %s", w.Code, w.Body.String())
		}
		var result struct {
			Category categoryView `json:"category"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		return result.Category.ID
	}
	empty := req("GET", "/api/categories", "", a)
	if empty.Code != 200 || !strings.Contains(empty.Body.String(), `"categories":[]`) {
		t.Fatalf("empty categories response: %s", empty.Body.String())
	}
	parent := create("Food", "null", a)
	child := create("Groceries", fmt.Sprintf("%q", parent), a)
	foreign := create("Foreign", "null", b)
	for _, test := range []struct {
		body   string
		status int
	}{{`{"name":"food","kind":"expense"}`, 409}, {fmt.Sprintf(`{"name":"x","kind":"expense","parentId":%q}`, foreign), 400}, {fmt.Sprintf(`{"name":"x","kind":"income","parentId":%q}`, parent), 400}, {fmt.Sprintf(`{"name":"x","kind":"expense","parentId":%q}`, child), 400}} {
		if w := req("POST", "/api/categories", test.body, a); w.Code != test.status {
			t.Fatalf("invalid: %d %s", w.Code, w.Body.String())
		}
	}
	if w := req("PUT", "/api/categories/"+parent, fmt.Sprintf(`{"name":"Food","kind":"expense","parentId":%q}`, child), a); w.Code != 400 {
		t.Fatal("cycle accepted")
	}
	if w := req("DELETE", "/api/categories/"+parent, "", b); w.Code != 404 {
		t.Fatal("cross-user delete")
	}
	if w := req("POST", "/api/transactions", fmt.Sprintf(`{"kind":"income","amount":10,"date":"2026-01-01","categoryId":%q}`, parent), a); w.Code != 400 {
		t.Fatal("mismatched kind accepted")
	}
	w := req("POST", "/api/transactions", fmt.Sprintf(`{"kind":"expense","amount":10,"date":"2026-01-01","categoryId":%q}`, parent), a)
	if w.Code != 201 {
		t.Fatalf("transaction %d %s", w.Code, w.Body.String())
	}
	var result struct {
		Transaction transactionView `json:"transaction"`
	}
	json.Unmarshal(w.Body.Bytes(), &result)
	if w := req("DELETE", "/api/transactions/"+result.Transaction.ID, "", a); w.Code != 204 {
		t.Fatal("delete transaction")
	}
	if w := req("DELETE", "/api/categories/"+parent, "", a); w.Code != 204 {
		t.Fatalf("delete category %d", w.Code)
	}
	var row struct{ CategoryID *string }
	if err := tx.Table("transactions").Select("category_id").Where("id = ?", result.Transaction.ID).Scan(&row).Error; err != nil || row.CategoryID != nil {
		t.Fatal("transaction retained category")
	}
	var ch struct{ ParentID *string }
	if err := tx.Table("categories").Select("parent_id").Where("id = ?", child).Scan(&ch).Error; err != nil || ch.ParentID != nil {
		t.Fatal("child not promoted")
	}
	var n int64
	if err := tx.Table("categories").Where("id = ? AND deleted_at IS NOT NULL", parent).Count(&n).Error; err != nil || n != 1 {
		t.Fatal("category not soft deleted")
	}
	create("Food", "null", a)
	if w := req("POST", "/api/transactions/"+result.Transaction.ID+"/restore", "", a); w.Code != 204 {
		t.Fatal("restore failed")
	}
	if w := req("POST", "/api/transactions", fmt.Sprintf(`{"kind":"expense","amount":10,"date":"2026-01-01","categoryId":%q}`, parent), a); w.Code != 400 {
		t.Fatal("deleted category accepted")
	}
}
