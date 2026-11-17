package main

import (
	"encoding/json"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func TestSettingsWithSession(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to a disposable PostgreSQL database")
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
	id := uuid.NewString()
	if err := tx.Exec("INSERT INTO users (id,email,password_hash,email_verified_at) VALUES (?,?,?,?)", id, id+"@example.test", "test", time.Now()).Error; err != nil {
		t.Fatal(err)
	}
	if err := tx.Exec("INSERT INTO sessions (id,user_id,token_hash,csrf_hash,expires_at) VALUES (?,?,?,?,?)", uuid.NewString(), id, secretHash("session"), secretHash("csrf"), time.Now().Add(time.Hour)).Error; err != nil {
		t.Fatal(err)
	}
	gin.SetMode(gin.TestMode)
	r := gin.New()
	registerProfileRoutes(r, tx, "http://test")
	request := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Origin", "http://test")
		req.Header.Set("X-CSRF-Token", "csrf")
		req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "session"})
		req.AddCookie(&http.Cookie{Name: csrfCookieName, Value: "csrf"})
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}
	if w := request("PUT", "/api/settings", `{"currency":"IDR","locale":"en","openingBalance":12345,"transactionEntryDefault":"scan"}`); w.Code != 200 {
		t.Fatalf("update: %d %s", w.Code, w.Body.String())
	}
	w := request("GET", "/api/settings", "")
	var settings struct {
		Currency                string `json:"currency"`
		Opening                 int64  `json:"openingBalance"`
		TransactionEntryDefault string `json:"transactionEntryDefault"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &settings) != nil || settings.Currency != "IDR" || settings.Opening != 12345 || settings.TransactionEntryDefault != "scan" {
		t.Fatalf("read: %d %s", w.Code, w.Body.String())
	}
	if w := request("PUT", "/api/settings", `{"currency":"USD","locale":"en","openingBalance":12345,"transactionEntryDefault":"scan"}`); w.Code != 200 {
		t.Fatalf("supported fractional currency rejected: %d %s", w.Code, w.Body.String())
	}
	if w := request("PUT", "/api/settings", `{"currency":"EUR","locale":"en","openingBalance":12345,"transactionEntryDefault":"scan"}`); w.Code != 400 {
		t.Fatalf("unsupported currency accepted: %d", w.Code)
	}
	if w := request("PUT", "/api/profile", `{"name":"Rama Astra"}`); w.Code != 200 {
		t.Fatalf("profile name update: %d %s", w.Code, w.Body.String())
	}
	if w := request("PUT", "/api/profile", `{"name":"   "}`); w.Code != 400 {
		t.Fatalf("empty profile name accepted: %d", w.Code)
	}
	var name string
	if err := tx.Table("users").Select("name").Where("id = ?", id).Scan(&name).Error; err != nil || name != "Rama Astra" {
		t.Fatalf("empty name changed saved profile: %q, %v", name, err)
	}
}
