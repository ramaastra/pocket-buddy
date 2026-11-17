package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// TEST_DATABASE_URL must point to an isolated, disposable PostgreSQL database.
func TestSeedDemoAccountIntegration(t *testing.T) {
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

	const email, password = "demo@example.test", "synthetic-demo-password"
	if err := seedDemoAccount(tx, email, password); err != nil {
		t.Fatal(err)
	}
	var user authUser
	if err := tx.Table("users").Where("email = ?", email).Take(&user).Error; err != nil {
		t.Fatal(err)
	}
	if user.EmailVerifiedAt == nil || user.Currency != "IDR" || user.Opening != 5_000_000 || !verifyPassword(password, user.PasswordHash) {
		t.Fatal("demo account was not initialized as a verified IDR account with a valid Argon2id password")
	}
	assertCount := func(table string, want int64) {
		t.Helper()
		var count int64
		if err := tx.Table(table).Where("user_id = ?", user.ID).Count(&count).Error; err != nil {
			t.Fatal(err)
		}
		if count != want {
			t.Fatalf("%s count = %d, want %d", table, count, want)
		}
	}
	assertCount("categories", 7)
	assertCount("transactions", 10)
	assertCount("budgets", 3)
	assertCount("recurring_transactions", 2)

	// The same startup call must preserve both existing records and credentials.
	if err := seedDemoAccount(tx, email, "a-different-demo-password"); err != nil {
		t.Fatal(err)
	}
	assertCount("categories", 7)
	assertCount("transactions", 10)
	assertCount("budgets", 3)
	assertCount("recurring_transactions", 2)
	if !verifyPassword(password, user.PasswordHash) || verifyPassword("a-different-demo-password", user.PasswordHash) {
		t.Fatal("rerunning the demo seed changed the existing account password")
	}

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/login", login(tx, false, "http://test"))
	request := httptest.NewRequest(http.MethodPost, "/login", jsonReader(t, map[string]string{"email": email, "password": password}))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	r.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("seeded account login status = %d, want %d", recorder.Code, http.StatusOK)
	}
	if cookie := recorder.Result().Cookies(); len(cookie) == 0 || cookie[0].Name != sessionCookieName {
		t.Fatal("login did not establish an authenticated session")
	}

	if err := seedDemoAccount(tx, "", ""); err != nil {
		t.Fatalf("empty configuration should skip seeding: %v", err)
	}
	if err := seedDemoAccount(tx, email, "short"); err == nil {
		t.Fatal("expected invalid demo password configuration to fail")
	}
	if err := insertDemoData(tx, "not-a-uuid", time.Now().UTC()); err == nil {
		t.Fatal("expected invalid owner id to fail seeding")
	}
}

func jsonReader(t *testing.T, value any) *strings.Reader {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return strings.NewReader(string(encoded))
}
