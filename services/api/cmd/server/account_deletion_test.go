package main

import (
	"encoding/json"
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

func TestRegistrationAndAccountDeletionIntegration(t *testing.T) {
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
	authMailSender = func(string, string, string, string) error { return nil }
	t.Cleanup(func() { authMailSender = sendLocalAuthMail })
	t.Setenv("MAILPIT_HOST", "example.com")
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/register", registerAccount(tx, "http://test"))
	email := uuid.NewString() + "@example.test"
	body := `{"email":"` + email + `"}`
	request := func(method, path, payload string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(payload))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}
	first := request("POST", "/register", body)
	duplicate := request("POST", "/register", body)
	if first.Code != 201 || duplicate.Code != first.Code || first.Body.String() != duplicate.Body.String() {
		t.Fatalf("registration responses differ: %d and %d", first.Code, duplicate.Code)
	}
	var user struct{ ID string }
	if err := tx.Table("users").Select("id").Where("email = ?", email).Take(&user).Error; err != nil {
		t.Fatal(err)
	}
	// Account deletion is tested with an established account after verification.
	passwordHash, err := hashPassword("synthetic-password")
	if err != nil {
		t.Fatal(err)
	}
	if err := tx.Exec("UPDATE users SET password_hash = ?, email_verified_at = ? WHERE id = ?", passwordHash, time.Now().UTC(), user.ID).Error; err != nil {
		t.Fatal(err)
	}
	other, category, budget, schedule, occurrence, active, earlier := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	statements := []struct {
		sql  string
		args []interface{}
	}{
		{"INSERT INTO users (id,email,password_hash) VALUES (?,?,?)", []interface{}{other, other + "@example.test", "other"}},
		{"INSERT INTO categories (id,user_id,name,kind) VALUES (?,?,?,?)", []interface{}{category, user.ID, "test", "expense"}},
		{"INSERT INTO budgets (id,user_id,category_id,amount,period) VALUES (?,?,?,?,?)", []interface{}{budget, user.ID, category, 10, "monthly"}},
		{"INSERT INTO recurring_transactions (id,user_id,kind,amount,frequency,next_occurrence) VALUES (?,?,?,?,?,?)", []interface{}{schedule, user.ID, "expense", 10, "monthly", "2026-01-01"}},
		{"INSERT INTO recurring_occurrences (id,user_id,recurring_transaction_id,scheduled_date) VALUES (?,?,?,?)", []interface{}{occurrence, user.ID, schedule, "2026-01-01"}},
		{"INSERT INTO transactions (id,user_id,kind,amount,transaction_date) VALUES (?,?,?,?,?)", []interface{}{active, user.ID, "expense", 10, "2026-01-01"}},
		{"INSERT INTO transactions (id,user_id,kind,amount,transaction_date,deleted_at,purge_at) VALUES (?,?,?,?,?,?,?)", []interface{}{earlier, user.ID, "expense", 10, "2026-01-01", time.Now().Add(-time.Hour), time.Now().Add(24 * time.Hour)}},
		{"INSERT INTO sessions (id,user_id,token_hash,csrf_hash,expires_at) VALUES (?,?,?,?,?)", []interface{}{uuid.NewString(), user.ID, secretHash("session"), secretHash("csrf"), time.Now().Add(time.Hour)}},
	}
	for _, stmt := range statements {
		if err := tx.Exec(stmt.sql, stmt.args...).Error; err != nil {
			t.Fatal(err)
		}
	}
	var previous time.Time
	if err := tx.Raw("SELECT purge_at FROM transactions WHERE id = ?", earlier).Scan(&previous).Error; err != nil {
		t.Fatal(err)
	}
	r.POST("/delete", func(c *gin.Context) { c.Set("auth", authContext{UserID: user.ID}); c.Next() }, deleteAccount(tx, false))
	if w := request("POST", "/delete", `{"password":"synthetic-password"}`); w.Code != 204 {
		t.Fatalf("delete status %d", w.Code)
	}
	for _, table := range []string{"categories", "budgets", "recurring_transactions", "recurring_occurrences", "transactions"} {
		var count int64
		if err := tx.Table(table).Where("user_id = ? AND deleted_at IS NULL", user.ID).Count(&count).Error; err != nil || count != 0 {
			t.Fatalf("%s still active: %d %v", table, count, err)
		}
	}
	var remaining int64
	if err := tx.Table("sessions").Where("user_id = ?", user.ID).Count(&remaining).Error; err != nil || remaining != 0 {
		t.Fatal("sessions were not revoked")
	}
	var after time.Time
	if err := tx.Raw("SELECT purge_at FROM transactions WHERE id = ?", earlier).Scan(&after).Error; err != nil || !after.Equal(previous) {
		t.Fatal("previous deletion retention changed")
	}
	var userCount int64
	if err := tx.Table("users").Where("id = ? AND deleted_at IS NULL", other).Count(&userCount).Error; err != nil || userCount != 1 {
		t.Fatal("other user was changed")
	}
	if err := tx.Exec("UPDATE users SET deleted_at = ? WHERE id = ?", time.Now().Add(-31*24*time.Hour), user.ID).Error; err != nil {
		t.Fatal(err)
	}
	if err := purgeDeletedAccounts(tx); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"categories", "budgets", "recurring_transactions", "recurring_occurrences", "transactions"} {
		var count int64
		if err := tx.Table(table).Where("user_id = ?", user.ID).Count(&count).Error; err != nil || count != 0 {
			t.Fatalf("%s was not purged with account", table)
		}
	}
	if err := tx.Table("users").Where("id = ?", other).Count(&userCount).Error; err != nil || userCount != 1 {
		t.Fatal("purge affected other user")
	}
	var reply map[string]any
	if err := json.Unmarshal(first.Body.Bytes(), &reply); err != nil {
		t.Fatal(err)
	}
}
