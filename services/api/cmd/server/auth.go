package main

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/argon2"
	"gorm.io/gorm"
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
	ID           string `gorm:"type:uuid;primaryKey"`
	Email        string `gorm:"not null"`
	PasswordHash string `gorm:"column:password_hash;not null"`
	Currency     string `gorm:"not null"`
	Locale       string `gorm:"not null"`
	Opening      int64  `gorm:"column:opening_balance;not null"`
}

type authContext struct {
	UserID string
	Email  string
	CSRF   string
}

func registerAuthRoutes(r *gin.Engine, db *gorm.DB, origin string, secureCookies bool) {
	r.POST("/api/auth/register", requireOrigin(origin), authRateLimit(), registerAccount(db, secureCookies))
	r.POST("/api/auth/login", requireOrigin(origin), authRateLimit(), login(db, secureCookies))

	auth := r.Group("/api")
	auth.Use(loadSession(db))
	auth.GET("/auth/me", func(c *gin.Context) {
		identity := c.MustGet("auth").(authContext)
		c.JSON(http.StatusOK, gin.H{"user": gin.H{"id": identity.UserID, "email": identity.Email}, "csrfToken": identity.CSRF})
	})
	auth.POST("/auth/logout", requireOrigin(origin), requireCSRF(), logout(db, secureCookies))

	transactions := auth.Group("/transactions")
	transactions.GET("", listTransactions(db))
	transactions.POST("", requireOrigin(origin), requireCSRF(), createTransaction(db))
}

func listTransactions(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		identity := c.MustGet("auth").(authContext)
		type cursor struct {
			Date string `json:"date"`
			ID   string `json:"id"`
		}
		var items []Transaction
		query := db.Where("user_id = ? AND deleted_at IS NULL", identity.UserID).Order("transaction_date DESC, id DESC")
		if kind := c.Query("kind"); kind == "income" || kind == "expense" {
			query = query.Where("kind = ?", kind)
		}
		if raw := c.Query("cursor"); raw != "" {
			decoded, err := base64.RawURLEncoding.DecodeString(raw)
			var point cursor
			if err != nil || json.Unmarshal(decoded, &point) != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid cursor"})
				return
			}
			date, dateErr := time.Parse("2006-01-02", point.Date)
			if dateErr != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid cursor"})
				return
			}
			if _, err := uuid.Parse(point.ID); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid cursor"})
				return
			}
			query = query.Where("(transaction_date < ? OR (transaction_date = ? AND id < ?))", date, date, point.ID)
		}
		if err := query.Limit(26).Find(&items).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not load transactions"})
			return
		}
		var nextCursor *string
		if len(items) > 25 {
			items = items[:25]
			last := items[len(items)-1]
			encoded, _ := json.Marshal(cursor{Date: last.TransactionDate.Format("2006-01-02"), ID: last.ID})
			value := base64.RawURLEncoding.EncodeToString(encoded)
			nextCursor = &value
		}
		c.JSON(http.StatusOK, gin.H{"transactions": items, "nextCursor": nextCursor})
	}
}

func createTransaction(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		identity := c.MustGet("auth").(authContext)
		var input struct {
			Kind       string  `json:"kind" binding:"required,oneof=income expense"`
			Amount     int64   `json:"amount" binding:"required,gt=0"`
			Date       string  `json:"date" binding:"required"`
			CategoryID *string `json:"categoryId"`
			Merchant   string  `json:"merchant"`
			Note       string  `json:"note"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Enter a valid transaction"})
			return
		}
		date, err := time.Parse("2006-01-02", input.Date)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Date must use YYYY-MM-DD"})
			return
		}
		if input.CategoryID != nil {
			if _, err := uuid.Parse(*input.CategoryID); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Category is invalid"})
				return
			}
			var count int64
			if err := db.Table("categories").Where("id = ? AND user_id = ? AND kind = ?", *input.CategoryID, identity.UserID, input.Kind).Count(&count).Error; err != nil || count == 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Category is invalid for this transaction"})
				return
			}
		}
		if len(input.Merchant) > 120 || len(input.Note) > 2000 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Merchant or note is too long"})
			return
		}
		item := Transaction{ID: uuid.NewString(), UserID: identity.UserID, Kind: input.Kind, Amount: input.Amount, TransactionDate: date, CategoryID: input.CategoryID, Merchant: input.Merchant, Note: input.Note}
		if err := db.Create(&item).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not save transaction"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"transaction": item})
	}
}

func registerAccount(db *gorm.DB, secure bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			Email    string `json:"email" binding:"required"`
			Password string `json:"password" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Enter a valid email and password"})
			return
		}
		input.Email = strings.ToLower(strings.TrimSpace(input.Email))
		if len(input.Email) > 254 || !strings.Contains(input.Email, "@") || len(input.Password) < 12 || len(input.Password) > 128 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Enter a valid email and a password between 12 and 128 characters"})
			return
		}
		hash, err := hashPassword(input.Password)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not create account"})
			return
		}
		user := authUser{ID: uuid.NewString(), Email: input.Email, PasswordHash: hash, Currency: "IDR", Locale: "en", Opening: 0}
		if err := db.Table("users").Create(&user).Error; err != nil {
			c.JSON(http.StatusConflict, gin.H{"error": "Could not create account with those details"})
			return
		}
		csrf, err := createSession(db, user.ID, c, secure)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not start session"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"user": gin.H{"id": user.ID, "email": user.Email}, "csrfToken": csrf})
	}
}

func login(db *gorm.DB, secure bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			Email    string `json:"email" binding:"required"`
			Password string `json:"password" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Enter your email and password"})
			return
		}
		var user authUser
		err := db.Table("users").Where("email = ? AND deleted_at IS NULL", strings.ToLower(strings.TrimSpace(input.Email))).Take(&user).Error
		if err != nil || !verifyPassword(input.Password, user.PasswordHash) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Email or password is incorrect"})
			return
		}
		csrf, err := createSession(db, user.ID, c, secure)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not start session"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"user": gin.H{"id": user.ID, "email": user.Email}, "csrfToken": csrf})
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
		err = db.Table("sessions").Select("sessions.user_id, users.email, sessions.token_hash, sessions.csrf_hash, sessions.expires_at").Joins("JOIN users ON users.id = sessions.user_id").Where("sessions.token_hash = ? AND sessions.expires_at > ? AND users.deleted_at IS NULL", secretHash(rawToken), time.Now().UTC()).Take(&result).Error
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

func authRateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		now := time.Now()
		ip := c.ClientIP()
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
		if window.count > 10 {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "Try again later"})
			return
		}
		c.Next()
	}
}
