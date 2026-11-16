package main

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func TestRegistrationRequiresOwnerChosenPassword(t *testing.T) {
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
	pool, _ := db.DB()
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
	r.POST("/login", login(tx, false, "http://test"))
	r.POST("/verify", confirmAuthToken(tx, "verify"))
	r.POST("/reset", confirmAuthToken(tx, "reset"))
	req := func(path, body string) *httptest.ResponseRecorder {
		q := httptest.NewRequest("POST", path, strings.NewReader(body))
		q.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, q)
		return w
	}
	email := uuid.NewString() + "@example.test"
	registration := `{"email":"` + email + `","password":"attacker-password"}`
	first := req("/register", registration)
	duplicate := req("/register", `{"email":"`+email+`","password":"different-password"}`)
	if first.Code != 201 || duplicate.Code != 201 || first.Body.String() != duplicate.Body.String() {
		t.Fatal("registration responses differ")
	}
	var user authUser
	if err := tx.Table("users").Where("email = ?", email).Take(&user).Error; err != nil {
		t.Fatal(err)
	}
	if user.PasswordHash != pendingPasswordHash || user.EmailVerifiedAt != nil || verifyPassword("attacker-password", user.PasswordHash) {
		t.Fatal("pending account retained a supplied password")
	}
	var original struct{ ID string }
	if err := tx.Table("auth_tokens").Select("id").Where("user_id=? AND purpose='verify'", user.ID).Take(&original).Error; err != nil {
		t.Fatal(err)
	}
	pendingLogin := req("/login", `{"email":"`+email+`","password":"attacker-password"}`)
	unknownLogin := req("/login", `{"email":"unknown@example.test","password":"attacker-password"}`)
	if pendingLogin.Code != 401 || unknownLogin.Code != 401 || pendingLogin.Body.String() != unknownLogin.Body.String() {
		t.Fatal("unverified and unknown logins differed")
	}
	var after struct{ ID string }
	if err := tx.Table("auth_tokens").Select("id").Where("user_id=? AND purpose='verify'", user.ID).Take(&after).Error; err != nil || after.ID != original.ID {
		t.Fatal("cooldown failed")
	}
	if err := tx.Exec("UPDATE auth_tokens SET token_hash=?, created_at=? WHERE id=?", secretHash("old-synthetic"), time.Now().UTC().Add(-2*time.Minute), original.ID).Error; err != nil {
		t.Fatal(err)
	}
	if w := req("/register", `{"email":"`+email+`"}`); w.Code != 201 {
		t.Fatal("pending re-registration failed")
	}
	if w := req("/verify", `{"token":"old-synthetic","password":"owner-new-password"}`); w.Code != 400 {
		t.Fatal("old verification link remained valid")
	}
	var replacement struct{ ID string }
	if err := tx.Table("auth_tokens").Select("id").Where("user_id=? AND purpose='verify'", user.ID).Take(&replacement).Error; err != nil || replacement.ID == original.ID {
		t.Fatal("new verification link missing")
	}
	if err := tx.Exec("UPDATE auth_tokens SET token_hash=? WHERE id=?", secretHash("owner-synthetic"), replacement.ID).Error; err != nil {
		t.Fatal(err)
	}
	if w := req("/verify", `{"token":"owner-synthetic"}`); w.Code != 400 {
		t.Fatal("verification accepted no password")
	}
	if w := req("/verify", `{"token":"owner-synthetic","password":"short"}`); w.Code != 400 {
		t.Fatal("verification accepted weak password")
	}
	if err := tx.Exec("UPDATE auth_tokens SET expires_at = ? WHERE id = ?", time.Now().UTC().Add(-time.Minute), replacement.ID).Error; err != nil {
		t.Fatal(err)
	}
	if w := req("/verify", `{"token":"owner-synthetic","password":"owner-new-password"}`); w.Code != 400 {
		t.Fatal("expired verification link was accepted")
	}
	if err := tx.Exec("UPDATE auth_tokens SET expires_at = ? WHERE id = ?", time.Now().UTC().Add(time.Hour), replacement.ID).Error; err != nil {
		t.Fatal(err)
	}
	if err := tx.Exec("INSERT INTO auth_tokens (id,user_id,token_hash,purpose,expires_at) VALUES (?,?,?,?,?)", uuid.NewString(), user.ID, secretHash("pending-reset"), "reset", time.Now().UTC().Add(time.Hour)).Error; err != nil {
		t.Fatal(err)
	}
	if err := tx.Exec("INSERT INTO sessions (id,user_id,token_hash,csrf_hash,expires_at) VALUES (?,?,?,?,?)", uuid.NewString(), user.ID, secretHash("pending-session"), secretHash("pending-csrf"), time.Now().UTC().Add(time.Hour)).Error; err != nil {
		t.Fatal(err)
	}
	if w := req("/verify", `{"token":"owner-synthetic","password":"owner-new-password"}`); w.Code != 204 {
		t.Fatalf("verification failed: %d", w.Code)
	}
	if err := tx.Table("users").Where("id=?", user.ID).Take(&user).Error; err != nil {
		t.Fatal(err)
	}
	if user.EmailVerifiedAt == nil || !verifyPassword("owner-new-password", user.PasswordHash) || verifyPassword("attacker-password", user.PasswordHash) {
		t.Fatal("owner password not established safely")
	}
	var tokens, sessions int64
	tx.Table("auth_tokens").Where("user_id=?", user.ID).Count(&tokens)
	tx.Table("sessions").Where("user_id=?", user.ID).Count(&sessions)
	if tokens != 0 || sessions != 0 {
		t.Fatal("verification left outstanding sessions or tokens")
	}
	if w := req("/verify", `{"token":"owner-synthetic","password":"owner-new-password"}`); w.Code != 400 {
		t.Fatal("verification token was reusable")
	}
	if w := req("/reset", `{"token":"pending-reset","password":"attacker-password"}`); w.Code != 400 {
		t.Fatal("pending reset token remained usable")
	}
	if w := req("/register", registration); w.Code != first.Code || w.Body.String() != first.Body.String() {
		t.Fatal("verified registration response differs")
	}
	var current authUser
	tx.Table("users").Where("id=?", user.ID).Take(&current)
	if current.PasswordHash != user.PasswordHash {
		t.Fatal("registration changed verified account password")
	}
	tx.Table("auth_tokens").Where("user_id=?", user.ID).Count(&tokens)
	if tokens != 0 {
		t.Fatal("verified account received a verification token")
	}
	if w := req("/login", `{"email":"`+email+`","password":"owner-new-password"}`); w.Code != 200 {
		t.Fatalf("owner login failed: %d", w.Code)
	}
	if w := req("/login", `{"email":"`+email+`","password":"attacker-password"}`); w.Code != 401 {
		t.Fatal("pre-registration password can log in")
	}
	if err := tx.Exec("INSERT INTO auth_tokens (id,user_id,token_hash,purpose,expires_at) VALUES (?,?,?,?,?)", uuid.NewString(), user.ID, secretHash("verified-reset"), "reset", time.Now().UTC().Add(time.Hour)).Error; err != nil {
		t.Fatal(err)
	}
	if err := tx.Exec("INSERT INTO auth_tokens (id,user_id,token_hash,purpose,expires_at) VALUES (?,?,?,?,?)", uuid.NewString(), user.ID, secretHash("extra-verification"), "verify", time.Now().UTC().Add(time.Hour)).Error; err != nil {
		t.Fatal(err)
	}
	if w := req("/reset", `{"token":"verified-reset","password":"owner-reset-password"}`); w.Code != 204 {
		t.Fatal("verified account password reset failed")
	}
	tx.Table("auth_tokens").Where("user_id=?", user.ID).Count(&tokens)
	tx.Table("sessions").Where("user_id=?", user.ID).Count(&sessions)
	if tokens != 0 || sessions != 0 {
		t.Fatal("password reset left outstanding sessions or tokens")
	}
	if w := req("/login", `{"email":"`+email+`","password":"owner-reset-password"}`); w.Code != 200 {
		t.Fatal("login after password reset failed")
	}
}

func TestConcurrentVerificationConsumesTokenOnce(t *testing.T) {
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
	pool, _ := db.DB()
	defer pool.Close()
	id := uuid.NewString()
	if err := db.Exec("INSERT INTO users (id,email,password_hash) VALUES (?,?,?)", id, id+"@example.test", pendingPasswordHash).Error; err != nil {
		t.Fatal(err)
	}
	defer db.Exec("DELETE FROM users WHERE id = ?", id)
	if err := db.Exec("INSERT INTO auth_tokens (id,user_id,token_hash,purpose,expires_at) VALUES (?,?,?,?,?)", uuid.NewString(), id, secretHash("concurrent-synthetic"), "verify", time.Now().UTC().Add(time.Hour)).Error; err != nil {
		t.Fatal(err)
	}
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/verify", confirmAuthToken(db, "verify"))
	results := make(chan int, 2)
	for _, pw := range []string{"owner-password-one", "owner-password-two"} {
		go func(password string) {
			q := httptest.NewRequest("POST", "/verify", strings.NewReader(`{"token":"concurrent-synthetic","password":"`+password+`"}`))
			q.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			r.ServeHTTP(w, q)
			results <- w.Code
		}(pw)
	}
	first, second := <-results, <-results
	if !((first == 204 && second == 400) || (first == 400 && second == 204)) {
		t.Fatalf("concurrent verification statuses: %d and %d", first, second)
	}
	var user authUser
	if err := db.Table("users").Where("id=?", id).Take(&user).Error; err != nil {
		t.Fatal(err)
	}
	if user.EmailVerifiedAt == nil || verifyPassword("owner-password-one", user.PasswordHash) == verifyPassword("owner-password-two", user.PasswordHash) {
		t.Fatal("exactly one owner password should be active")
	}
}

func TestLegacyPendingPasswordCannotSurviveVerification(t *testing.T) {
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
	pool, _ := db.DB()
	defer pool.Close()
	tx := db.Begin()
	defer tx.Rollback()
	attackerHash, err := hashPassword("attacker-password")
	if err != nil {
		t.Fatal(err)
	}
	id := uuid.NewString()
	if err := tx.Exec("INSERT INTO users (id,email,password_hash) VALUES (?,?,?)", id, id+"@example.test", attackerHash).Error; err != nil {
		t.Fatal(err)
	}
	if err := tx.Exec("INSERT INTO transactions (id,user_id,kind,amount,transaction_date) VALUES (?,?,?,?,?)", uuid.NewString(), id, "expense", 123, "2026-01-01").Error; err != nil {
		t.Fatal(err)
	}
	if err := tx.Exec("INSERT INTO auth_tokens (id,user_id,token_hash,purpose,expires_at) VALUES (?,?,?,?,?)", uuid.NewString(), id, secretHash("legacy-synthetic"), "verify", time.Now().UTC().Add(time.Hour)).Error; err != nil {
		t.Fatal(err)
	}
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/verify", confirmAuthToken(tx, "verify"))
	q := httptest.NewRequest("POST", "/verify", strings.NewReader(`{"token":"legacy-synthetic","password":"owner-new-password"}`))
	q.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, q)
	if w.Code != 204 {
		t.Fatalf("legacy verification status %d", w.Code)
	}
	var user authUser
	if err := tx.Table("users").Where("id=?", id).Take(&user).Error; err != nil {
		t.Fatal(err)
	}
	if user.EmailVerifiedAt == nil || verifyPassword("attacker-password", user.PasswordHash) || !verifyPassword("owner-new-password", user.PasswordHash) {
		t.Fatal("legacy pending password survived verification")
	}
	var count int64
	if err := tx.Table("transactions").Where("user_id = ? AND amount = ?", id, 123).Count(&count).Error; err != nil || count != 1 {
		t.Fatal("legacy account data was not preserved")
	}
}

func TestConcurrentVerificationEmailRequestsAreLimited(t *testing.T) {
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
	pool, _ := db.DB()
	defer pool.Close()
	t.Setenv("MAILPIT_HOST", "example.com")
	id := uuid.NewString()
	email := id + "@example.test"
	if err := db.Exec("INSERT INTO users (id,email,password_hash) VALUES (?,?,?)", id, email, pendingPasswordHash).Error; err != nil {
		t.Fatal(err)
	}
	defer db.Exec("DELETE FROM users WHERE id = ?", id)
	const attempts = 8
	results := make(chan error, attempts)
	for i := 0; i < attempts; i++ {
		go func() { results <- issueAuthToken(db, id, email, "verify", "http://test") }()
	}
	for i := 0; i < attempts; i++ {
		if err := <-results; err != nil {
			t.Fatal(err)
		}
	}
	var count int64
	deadline := time.Now().Add(2 * time.Second)
	for {
		if err := db.Table("auth_tokens").Where("user_id=? AND purpose='verify'", id).Count(&count).Error; err != nil {
			t.Fatal(err)
		}
		if count == 0 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("failed delivery left %d verification tokens", count)
		}
		time.Sleep(10 * time.Millisecond)
	}
	if err := issueAuthToken(db, id, email, "verify", "http://test"); err != nil {
		t.Fatal(err)
	}
}
