package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestRecurringAPIIntegration(t *testing.T) {
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
	pool, _ := db.DB()
	defer pool.Close()
	tx := db.Begin()
	defer tx.Rollback()
	owner, other, category := uuid.NewString(), uuid.NewString(), uuid.NewString()
	for _, id := range []string{owner, other} {
		if err := tx.Exec("INSERT INTO users (id,email,password_hash) VALUES (?,?,?)", id, id+"@example.test", "test").Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := tx.Exec("INSERT INTO categories (id,user_id,name,kind) VALUES (?,?,?,?)", category, owner, "Food", "expense").Error; err != nil {
		t.Fatal(err)
	}
	gin.SetMode(gin.TestMode)
	r := gin.New()
	g := r.Group("/api")
	g.Use(func(c *gin.Context) {
		c.Set("auth", authContext{UserID: c.GetHeader("Test-User")})
		c.Set("csrf_hash", secretHash("test"))
		c.Next()
	})
	registerRecurringRoutes(g, tx, "http://test")
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
	payload := fmt.Sprintf(`{"description":"Rent","categoryId":%q,"kind":"expense","amount":100,"frequency":"monthly","nextDate":"2025-01-31"}`, category)
	if w := request("POST", "/api/recurring", payload, other); w.Code != 400 {
		t.Fatalf("category ownership: %d %s", w.Code, w.Body.String())
	}
	if w := request("POST", "/api/recurring", payload, owner); w.Code != 204 {
		t.Fatalf("create: %d %s", w.Code, w.Body.String())
	}
	if w := request("POST", "/api/recurring/sync", `{"on":"2025-03-31"}`, owner); w.Code != 204 {
		t.Fatalf("sync: %d %s", w.Code, w.Body.String())
	}
	w := request("GET", "/api/recurring", "", owner)
	if w.Code != 200 {
		t.Fatalf("list: %d %s", w.Code, w.Body.String())
	}
	var result struct {
		Schedules   []struct{ ID, NextDate string }
		Occurrences []struct {
			ID, Date, Description string
			Amount                int64
		}
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Schedules) != 1 || result.Schedules[0].NextDate != "2025-04-30" || len(result.Occurrences) != 3 || result.Occurrences[1].Date != "2025-02-28" {
		t.Fatalf("unexpected schedule: %s", w.Body.String())
	}
	id := result.Schedules[0].ID
	edited := fmt.Sprintf(`{"description":"New rent","categoryId":%q,"kind":"expense","amount":200,"frequency":"monthly","nextDate":"2025-04-30"}`, category)
	if w = request("PUT", "/api/recurring/"+id, edited, owner); w.Code != 204 {
		t.Fatalf("update: %d %s", w.Code, w.Body.String())
	}
	occ := result.Occurrences[0].ID
	confirm := fmt.Sprintf(`{"description":"Edited occurrence","categoryId":%q,"kind":"expense","amount":125,"date":"2025-01-31"}`, category)
	if w = request("POST", "/api/recurring/occurrences/"+occ+"/confirm", confirm, other); w.Code != 404 {
		t.Fatalf("ownership: %d", w.Code)
	}
	if w = request("POST", "/api/recurring/occurrences/"+occ+"/confirm", confirm, owner); w.Code != 204 {
		t.Fatalf("confirm: %d %s", w.Code, w.Body.String())
	}
	if w = request("POST", "/api/recurring/occurrences/"+occ+"/confirm", confirm, owner); w.Code != 404 {
		t.Fatalf("duplicate confirmation: %d", w.Code)
	}
	var count int64
	tx.Table("transactions").Where("user_id = ? AND description = ? AND amount = ?", owner, "Edited occurrence", 125).Count(&count)
	if count != 1 {
		t.Fatalf("transactions: %d", count)
	}
	w = request("GET", "/api/recurring", "", owner)
	if !strings.Contains(w.Body.String(), `"description":"Rent"`) {
		t.Fatalf("pending snapshot changed: %s", w.Body.String())
	}
	if w = request("POST", "/api/recurring/occurrences/"+result.Occurrences[1].ID+"/skip", `{}`, owner); w.Code != 204 {
		t.Fatalf("skip: %d", w.Code)
	}
	paused := fmt.Sprintf(`{"description":"New rent","categoryId":%q,"kind":"expense","amount":200,"frequency":"monthly","nextDate":"2025-04-30","paused":true,"on":"2025-05-31"}`, category)
	if w = request("PUT", "/api/recurring/"+id, paused, owner); w.Code != 204 {
		t.Fatalf("pause: %d %s", w.Code, w.Body.String())
	}
	w = request("GET", "/api/recurring", "", owner)
	if !strings.Contains(w.Body.String(), `"date":"2025-05-31"`) {
		t.Fatalf("due occurrence missing before pause: %s", w.Body.String())
	}
	resume := fmt.Sprintf(`{"description":"New rent","categoryId":%q,"kind":"expense","amount":200,"frequency":"monthly","nextDate":"2025-06-30","paused":false,"on":"2025-08-01"}`, category)
	if w = request("PUT", "/api/recurring/"+id, resume, owner); w.Code != 204 {
		t.Fatalf("resume: %d %s", w.Code, w.Body.String())
	}
	w = request("GET", "/api/recurring", "", owner)
	if !strings.Contains(w.Body.String(), `"nextDate":"2025-08-31"`) {
		t.Fatalf("resume should advance past paused dates: %s", w.Body.String())
	}
}
