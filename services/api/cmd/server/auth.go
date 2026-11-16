package main

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/mail"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/argon2"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	sessionCookieName = "pocket_buddy_session"
	csrfCookieName    = "pocket_buddy_csrf"
	sessionDuration   = 24 * time.Hour
)

type authSession struct {
	ID        string    `gorm:"type:uuid;primaryKey"`
	UserID    string    `gorm:"type:uuid;not null"`
	TokenHash string    `gorm:"not null;uniqueIndex"`
	CSRFHash  string    `gorm:"not null"`
	ExpiresAt time.Time `gorm:"not null"`
}

type authUser struct {
	ID              string     `gorm:"type:uuid;primaryKey"`
	Email           string     `gorm:"not null"`
	EmailVerifiedAt *time.Time `gorm:"column:email_verified_at"`
	PasswordHash    string     `gorm:"column:password_hash;not null"`
	Currency        string     `gorm:"not null"`
	Locale          string     `gorm:"not null"`
	Opening         int64      `gorm:"column:opening_balance;not null"`
}

type authContext struct {
	UserID string
	Email  string
	CSRF   string
}

func registerAuthRoutes(r *gin.Engine, db *gorm.DB, origin string, secureCookies bool) {
	r.POST("/api/auth/register", requireOrigin(origin), authRateLimit(), registerAccount(db, origin))
	r.POST("/api/auth/login", requireOrigin(origin), authRateLimit(), login(db, secureCookies, origin))
	r.POST("/api/auth/verification/request", requireOrigin(origin), authRateLimit(), requestAuthToken(db, "verify", origin))
	r.POST("/api/auth/verification/check", requireOrigin(origin), authLinkRateLimit(), checkAuthToken(db, "verify"))
	r.POST("/api/auth/verification/confirm", requireOrigin(origin), authRateLimit(), confirmAuthToken(db, "verify"))
	r.POST("/api/auth/password-reset/request", requireOrigin(origin), authRateLimit(), requestAuthToken(db, "reset", origin))
	r.POST("/api/auth/password-reset/check", requireOrigin(origin), authLinkRateLimit(), checkAuthToken(db, "reset"))
	r.POST("/api/auth/password-reset/confirm", requireOrigin(origin), authRateLimit(), confirmAuthToken(db, "reset"))

	auth := r.Group("/api")
	auth.Use(loadSession(db))
	auth.GET("/auth/me", func(c *gin.Context) {
		identity := c.MustGet("auth").(authContext)
		c.JSON(http.StatusOK, gin.H{"user": gin.H{"id": identity.UserID, "email": identity.Email}, "csrfToken": identity.CSRF})
	})
	auth.POST("/auth/logout", requireOrigin(origin), requireCSRF(), logout(db, secureCookies))
	auth.DELETE("/auth/account", requireOrigin(origin), requireCSRF(), deleteAccount(db, secureCookies))

	registerTransactionRoutes(auth, db, origin)
	registerCategoryRoutes(auth, db, origin)
	registerBudgetRoutes(auth, db, origin)
	registerRecurringRoutes(auth, db, origin)
}

// Pending accounts cannot authenticate; their password is chosen only after email verification.
const pendingPasswordHash = "!"

func registerAccount(db *gorm.DB, origin string) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			Email string `json:"email" binding:"required"`
		}
		if c.ShouldBindJSON(&input) != nil {
			c.JSON(400, gin.H{"error": "Enter a valid email address"})
			return
		}
		input.Email = strings.ToLower(strings.TrimSpace(input.Email))
		address, err := mail.ParseAddress(input.Email)
		if len(input.Email) > 254 || err != nil || address.Address != input.Email || strings.ContainsAny(input.Email, "\r\n") {
			c.JSON(400, gin.H{"error": "Enter a valid email address"})
			return
		}
		user := authUser{ID: uuid.NewString(), Email: input.Email, PasswordHash: pendingPasswordHash, Currency: "IDR", Locale: "en", Opening: 0}
		result := db.Table("users").Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "email"}}, DoNothing: true}).Create(&user)
		if result.Error != nil {
			c.JSON(500, gin.H{"error": "Could not create account"})
			return
		}
		// Existing verified or deleted accounts are left untouched. Repeated pending
		// registrations request a link without ever adopting a supplied password.
		var pending authUser
		if db.Table("users").Where("email = ? AND deleted_at IS NULL AND email_verified_at IS NULL", input.Email).Take(&pending).Error == nil {
			_ = issueAuthToken(db, pending.ID, pending.Email, "verify", origin)
		}
		c.JSON(http.StatusCreated, gin.H{"message": "If eligible, a verification link will be sent"})
	}
}

// A fixed, non-secret dummy hash keeps unknown and pending logins on the same
// expensive password-verification path as ordinary invalid logins.
const dummyPasswordHash = "$argon2id$v=19$m=65536,t=3,p=2$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

func login(db *gorm.DB, secure bool, origin string) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			Email    string `json:"email" binding:"required"`
			Password string `json:"password" binding:"required"`
		}
		if c.ShouldBindJSON(&input) != nil {
			c.JSON(400, gin.H{"error": "Enter your email and password"})
			return
		}
		var user authUser
		err := db.Table("users").Where("email = ? AND deleted_at IS NULL", strings.ToLower(strings.TrimSpace(input.Email))).Take(&user).Error
		encoded := dummyPasswordHash
		if err == nil && user.EmailVerifiedAt != nil {
			encoded = user.PasswordHash
		}
		valid := verifyPassword(input.Password, encoded)
		if err == nil && user.EmailVerifiedAt == nil {
			_ = issueAuthToken(db, user.ID, user.Email, "verify", origin)
		}
		if err != nil || user.EmailVerifiedAt == nil || !valid {
			c.JSON(401, gin.H{"error": "Check your email and password. If your account needs verification, check your inbox."})
			return
		}
		csrf, err := createSession(db, user.ID, c, secure)
		if err != nil {
			c.JSON(500, gin.H{"error": "Could not start session"})
			return
		}
		c.JSON(200, gin.H{"user": gin.H{"id": user.ID, "email": user.Email}, "csrfToken": csrf})
	}
}

func loadSession(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		rawToken, err := c.Cookie(sessionCookieName)
		if err != nil || rawToken == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Sign in required"})
			return
		}
		var result struct {
			UserID    string
			Email     string
			TokenHash string
			CSRFHash  string
			ExpiresAt time.Time
		}
		err = db.Table("sessions").Select("sessions.user_id, users.email, sessions.token_hash, sessions.csrf_hash, sessions.expires_at").Joins("JOIN users ON users.id = sessions.user_id").Where("sessions.token_hash = ? AND sessions.expires_at > ? AND users.deleted_at IS NULL AND users.email_verified_at IS NOT NULL", secretHash(rawToken), time.Now().UTC()).Take(&result).Error
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Sign in required"})
			return
		}
		csrf, _ := c.Cookie(csrfCookieName)
		c.Set("auth", authContext{UserID: result.UserID, Email: result.Email, CSRF: csrf})
		c.Set("csrf_hash", result.CSRFHash)
		c.Next()
	}
}

func logout(db *gorm.DB, secure bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		if token, err := c.Cookie(sessionCookieName); err == nil {
			db.Table("sessions").Where("token_hash = ?", secretHash(token)).Delete(&authSession{})
		}
		clearAuthCookies(c, secure)
		c.Status(http.StatusNoContent)
	}
}

func requireOrigin(origin string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.GetHeader("Origin") != origin {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "Request origin is not allowed"})
			return
		}
		c.Next()
	}
}

func requireCSRF() gin.HandlerFunc {
	return func(c *gin.Context) {
		cookie, cookieErr := c.Cookie(csrfCookieName)
		header := c.GetHeader("X-CSRF-Token")
		stored, _ := c.Get("csrf_hash")
		if cookieErr != nil || header == "" || subtle.ConstantTimeCompare([]byte(cookie), []byte(header)) != 1 || secretHash(cookie) != stored.(string) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "CSRF validation failed"})
			return
		}
		c.Next()
	}
}

func createSession(db *gorm.DB, userID string, c *gin.Context, secure bool) (string, error) {
	if oldToken, err := c.Cookie(sessionCookieName); err == nil && oldToken != "" {
		if err := db.Table("sessions").Where("token_hash = ?", secretHash(oldToken)).Delete(&authSession{}).Error; err != nil {
			return "", err
		}
	}
	token, err := randomSecret()
	if err != nil {
		return "", err
	}
	csrf, err := randomSecret()
	if err != nil {
		return "", err
	}
	session := authSession{ID: uuid.NewString(), UserID: userID, TokenHash: secretHash(token), CSRFHash: secretHash(csrf), ExpiresAt: time.Now().UTC().Add(sessionDuration)}
	if err := db.Table("sessions").Create(&session).Error; err != nil {
		return "", err
	}
	c.SetSameSite(http.SameSiteStrictMode)
	c.SetCookie(sessionCookieName, token, int(sessionDuration.Seconds()), "/", "", secure, true)
	c.SetCookie(csrfCookieName, csrf, int(sessionDuration.Seconds()), "/", "", secure, false)
	return csrf, nil
}

func clearAuthCookies(c *gin.Context, secure bool) {
	c.SetSameSite(http.SameSiteStrictMode)
	c.SetCookie(sessionCookieName, "", -1, "/", "", secure, true)
	c.SetCookie(csrfCookieName, "", -1, "/", "", secure, false)
}

func randomSecret() (string, error) {
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(secret), nil
}

func secretHash(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func hashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	const memory, iterations, parallelism = uint32(64 * 1024), uint32(3), uint8(2)
	hash := argon2.IDKey([]byte(password), salt, iterations, memory, parallelism, 32)
	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s", memory, iterations, parallelism, base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(hash)), nil
}

func verifyPassword(password, encoded string) bool {
	var memory, iterations uint32
	var parallelism uint8
	var saltText string
	if _, err := fmt.Sscanf(encoded, "$argon2id$v=19$m=%d,t=%d,p=%d$%s", &memory, &iterations, &parallelism, &saltText); err != nil {
		return false
	}
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || memory < 8*1024 || memory > 256*1024 || iterations == 0 || iterations > 10 || parallelism == 0 || parallelism > 8 {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) < 16 || len(salt) > 64 {
		return false
	}
	expected, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(expected) < 16 || len(expected) > 64 {
		return false
	}
	actual := argon2.IDKey([]byte(password), salt, iterations, memory, parallelism, uint32(len(expected)))
	return subtle.ConstantTimeCompare(actual, expected) == 1
}

type attemptWindow struct {
	count int
	start time.Time
}

var authAttempts = struct {
	sync.Mutex
	byIP        map[string]attemptWindow
	lastCleanup time.Time
}{byIP: make(map[string]attemptWindow)}

func authRateLimit() gin.HandlerFunc     { return authRateLimitFor("auth", 10) }
func authLinkRateLimit() gin.HandlerFunc { return authRateLimitFor("link-check", 30) }
func authRateLimitFor(scope string, limit int) gin.HandlerFunc {
	return func(c *gin.Context) {
		now := time.Now()
		ip := scope + ":" + c.ClientIP()
		authAttempts.Lock()
		if now.Sub(authAttempts.lastCleanup) > 15*time.Minute {
			for key, old := range authAttempts.byIP {
				if now.Sub(old.start) >= 15*time.Minute {
					delete(authAttempts.byIP, key)
				}
			}
			authAttempts.lastCleanup = now
		}
		window := authAttempts.byIP[ip]
		if now.Sub(window.start) >= 15*time.Minute {
			window = attemptWindow{start: now}
		}
		window.count++
		authAttempts.byIP[ip] = window
		authAttempts.Unlock()
		if window.count > limit {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "Try again later"})
			return
		}
		c.Next()
	}
}
