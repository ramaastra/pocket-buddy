package main

import (
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

func TestAuthenticationLinkChecks(t *testing.T) {
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
	pending, verified, deleted := uuid.NewString(), uuid.NewString(), uuid.NewString()
	for _, id := range []string{pending, verified, deleted} {
		if err := tx.Exec("INSERT INTO users (id,email,password_hash) VALUES (?,?,?)", id, id+"@example.test", pendingPasswordHash).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := tx.Exec("UPDATE users SET email_verified_at=? WHERE id=?", time.Now().UTC(), verified).Error; err != nil {
		t.Fatal(err)
	}
	if err := tx.Exec("UPDATE users SET deleted_at=? WHERE id=?", time.Now().UTC(), deleted).Error; err != nil {
		t.Fatal(err)
	}
	tokens := []struct {
		user, purpose, raw string
		expires            time.Time
	}{{pending, "verify", "synthetic-verify", time.Now().Add(time.Hour)}, {verified, "reset", "synthetic-reset", time.Now().Add(time.Hour)}, {deleted, "verify", "synthetic-deleted", time.Now().Add(time.Hour)}, {pending, "verify", "synthetic-expired", time.Now().Add(-time.Hour)}, {verified, "verify", "synthetic-verified", time.Now().Add(time.Hour)}, {pending, "reset", "synthetic-unverified-reset", time.Now().Add(time.Hour)}}
	for _, v := range tokens {
		if err := tx.Exec("INSERT INTO auth_tokens (id,user_id,token_hash,purpose,expires_at) VALUES (?,?,?,?,?)", uuid.NewString(), v.user, secretHash(v.raw), v.purpose, v.expires).Error; err != nil {
			t.Fatal(err)
		}
	}
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/verify/check", requireOrigin("http://test"), checkAuthToken(tx, "verify"))
	r.POST("/reset/check", requireOrigin("http://test"), checkAuthToken(tx, "reset"))
	r.POST("/verify/confirm", confirmAuthToken(tx, "verify"))
	r.POST("/reset/confirm", confirmAuthToken(tx, "reset"))
	req := func(path, token, origin string) *httptest.ResponseRecorder {
		q := httptest.NewRequest("POST", path, strings.NewReader(`{"token":"`+token+`","password":"synthetic-owner-password"}`))
		q.Header.Set("Content-Type", "application/json")
		if origin != "" {
			q.Header.Set("Origin", origin)
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, q)
		return w
	}
	if w := req("/verify/check", "synthetic-verify", ""); w.Code != 403 {
		t.Fatal("link check accepted missing origin")
	}
	for _, check := range []struct {
		path, token string
		status      int
	}{{"/verify/check", "synthetic-verify", 204}, {"/reset/check", "synthetic-reset", 204}, {"/verify/check", "synthetic-reset", 400}, {"/verify/check", "synthetic-expired", 400}, {"/verify/check", "synthetic-deleted", 400}, {"/verify/check", "synthetic-verified", 400}, {"/reset/check", "synthetic-unverified-reset", 400}, {"/reset/check", "unknown", 400}, {"/verify/check", "", 400}} {
		w := req(check.path, check.token, "http://test")
		if w.Code != check.status {
			t.Fatalf("unexpected check status: %d", w.Code)
		}
		if check.status == 400 && !strings.Contains(w.Body.String(), `"code":"invalid_link"`) {
			t.Fatal("invalid response missing code")
		}
	}
	// Checking does not consume the link, which can still complete verification.
	if w := req("/verify/check", "synthetic-verify", "http://test"); w.Code != 204 {
		t.Fatal("valid check was not repeatable")
	}
	if w := req("/verify/confirm", "synthetic-verify", ""); w.Code != 204 {
		t.Fatalf("verification after check: %d", w.Code)
	}
	if w := req("/verify/check", "synthetic-verify", "http://test"); w.Code != 400 {
		t.Fatal("used verification link still valid")
	}
	if w := req("/reset/confirm", "synthetic-reset", ""); w.Code != 204 {
		t.Fatalf("reset after check: %d", w.Code)
	}
	if w := req("/reset/check", "synthetic-reset", "http://test"); w.Code != 400 {
		t.Fatal("used reset link still valid")
	}
}

func TestLinkCheckRateLimitIsSeparateFromAuthentication(t *testing.T) {
	authAttempts.Lock()
	delete(authAttempts.byIP, "link-check:192.0.2.137")
	delete(authAttempts.byIP, "auth:192.0.2.137")
	authAttempts.Unlock()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/check", authLinkRateLimit(), func(c *gin.Context) { c.Status(204) })
	r.POST("/auth", authRateLimit(), func(c *gin.Context) { c.Status(204) })
	request := func(path string) int {
		q := httptest.NewRequest("POST", path, nil)
		q.RemoteAddr = "192.0.2.137:12345"
		w := httptest.NewRecorder()
		r.ServeHTTP(w, q)
		return w.Code
	}
	for i := 0; i < 30; i++ {
		if got := request("/check"); got != 204 {
			t.Fatalf("link check %d status %d", i, got)
		}
	}
	if got := request("/check"); got != 429 {
		t.Fatalf("link check limit status %d", got)
	}
	for i := 0; i < 10; i++ {
		if got := request("/auth"); got != 204 {
			t.Fatalf("auth attempt %d status %d", i, got)
		}
	}
	if got := request("/auth"); got != 429 {
		t.Fatalf("auth limit status %d", got)
	}
}
