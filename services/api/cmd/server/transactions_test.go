package main

import (
	"bytes"
	"encoding/csv"
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

// TEST_DATABASE_URL must name an isolated PostgreSQL database; all fixtures are rolled back.
func TestTransactionAPIIntegration(t *testing.T) {
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
	a, b := uuid.NewString(), uuid.NewString()
	category := uuid.NewString()
	deletedCategory := uuid.NewString()
	for _, id := range []string{a, b} {
		if err := tx.Exec("INSERT INTO users (id,email,password_hash) VALUES (?, ?, ?)", id, id+"@example.test", "test").Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := tx.Exec("INSERT INTO categories (id,user_id,name,kind) VALUES (?, ?, ?, ?)", category, b, "Other", "expense").Error; err != nil {
		t.Fatal(err)
	}
	if err := tx.Exec("INSERT INTO categories (id,user_id,name,kind,deleted_at) VALUES (?, ?, ?, ?, ?)", deletedCategory, a, "Deleted", "expense", time.Now()).Error; err != nil {
		t.Fatal(err)
	}
	gin.SetMode(gin.TestMode)
	r := gin.New()
	auth := r.Group("/api")
	auth.Use(func(c *gin.Context) {
		c.Set("auth", authContext{UserID: c.GetHeader("Test-User")})
		c.Set("csrf_hash", secretHash("test"))
		c.Next()
	})
	registerTransactionRoutes(auth, tx, "http://test")
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
	for _, body := range []string{`{"kind":"expense","amount":0,"date":"2026-01-01"}`, `{"kind":"expense","amount":9007199254740992,"date":"2026-01-01"}`, `{"kind":"other","amount":1,"date":"2026-01-01"}`, `{"kind":"expense","amount":1.5,"date":"2026-01-01"}`, `{"kind":"expense","amount":1,"date":"2026-02-30"}`, fmt.Sprintf(`{"kind":"expense","amount":1,"date":"2026-01-01","categoryId":%q}`, category), fmt.Sprintf(`{"kind":"expense","amount":1,"date":"2026-01-01","categoryId":%q}`, deletedCategory)} {
		if w := request("POST", "/api/transactions", body, a); w.Code != 400 {
			t.Fatalf("invalid input status %d", w.Code)
		}
	}
	var first string
	for i := 0; i < 30; i++ {
		body := fmt.Sprintf(`{"kind":"expense","amount":%d,"date":"2026-01-01","merchant":"shop","description":"synthetic description"}`, i+1)
		w := request("POST", "/api/transactions", body, a)
		if w.Code != 201 {
			t.Fatalf("create status %d", w.Code)
		}
		if i == 0 {
			var got struct {
				Transaction struct {
					ID          string `json:"id"`
					Date        string `json:"date"`
					Currency    string `json:"currency"`
					Description string `json:"description"`
				} `json:"transaction"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
				t.Fatal(err)
			}
			if got.Transaction.Date != "2026-01-01" || got.Transaction.Currency != "IDR" || got.Transaction.Description != "synthetic description" {
				t.Fatal("unexpected date or currency")
			}
			first = got.Transaction.ID
		}
	}
	w := request("GET", "/api/transactions", "", b)
	var other struct {
		Total int `json:"total"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &other) != nil || other.Total != 0 {
		t.Fatalf("cross-user list: %d", w.Code)
	}
	w = request("GET", "/api/transactions?kind=expense&limit=10&sort=amount_desc", "", a)
	var list struct {
		Total        int `json:"total"`
		Transactions []struct {
			Amount int `json:"amount"`
		} `json:"transactions"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &list) != nil || list.Total != 30 || len(list.Transactions) != 10 || list.Transactions[0].Amount != 30 {
		t.Fatalf("incorrect list status or content: %d", w.Code)
	}
	if w = request("GET", "/api/transactions?q=synthetic", "", a); w.Code != 200 || !strings.Contains(w.Body.String(), `"total":30`) {
		t.Fatal("description search failed")
	}
	w = request("GET", "/api/transactions/export.csv?kind=expense&limit=10&sort=amount_desc", "", a)
	rows, err := csv.NewReader(bytes.NewReader(w.Body.Bytes())).ReadAll()
	if err != nil || w.Code != 200 || len(rows) != 31 || rows[1][2] != "30" {
		t.Fatalf("incorrect export: status %d rows %d error %v", w.Code, len(rows), err)
	}
	if w = request("DELETE", "/api/transactions/"+first, "", b); w.Code != 404 {
		t.Fatalf("cross-user delete: %d", w.Code)
	}
	if w = request("DELETE", "/api/transactions/"+first, "", a); w.Code != 204 {
		t.Fatalf("delete: %d", w.Code)
	}
	if w = request("POST", "/api/transactions/"+first+"/restore", "", b); w.Code != 404 {
		t.Fatalf("cross-user restore: %d", w.Code)
	}
	if w = request("POST", "/api/transactions/"+first+"/restore", "", a); w.Code != 204 {
		t.Fatalf("restore: %d", w.Code)
	}
	if err := tx.Exec("UPDATE transactions SET deleted_at=?, purge_at=? WHERE id=?", time.Now().Add(-31*24*time.Hour), time.Now().Add(-time.Hour), first).Error; err != nil {
		t.Fatal(err)
	}
	if w = request("POST", "/api/transactions/"+first+"/restore", "", a); w.Code != 404 {
		t.Fatalf("expired restore: %d", w.Code)
	}
	if err := purgeExpiredTransactions(tx, time.Now()); err != nil {
		t.Fatal(err)
	}
	var count int64
	if err := tx.Table("transactions").Where("id=?", first).Count(&count).Error; err != nil || count != 0 {
		t.Fatal("expired transaction not purged")
	}
}

func TestTransactionRoutesRegister(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	registerTransactionRoutes(r.Group("/api"), nil, "http://test")
}

func TestCSVSafe(t *testing.T) {
	for _, value := range []string{"=1+1", "  +1", "-2", "@x"} {
		if got := csvSafe(value); !strings.HasPrefix(got, "'") {
			t.Fatalf("unsafe value %q", value)
		}
	}
	if got := csvSafe("Normal shop"); got != "Normal shop" {
		t.Fatalf("unexpected escaping %q", got)
	}
}
