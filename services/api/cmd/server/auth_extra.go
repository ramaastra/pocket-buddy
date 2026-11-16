package main

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/mail"
	"net/smtp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Local mail is deliberately restricted to Mailpit or loopback; no production
// mail provider is configured and credentials must never be sent here.
func sendLocalAuthMail(email, purpose, token, origin string) error {
	host := env("MAILPIT_HOST", "mailpit")
	if host != "mailpit" && host != "localhost" && host != "127.0.0.1" && host != "::1" {
		return errors.New("mail host must be Mailpit or loopback")
	}
	address, err := mail.ParseAddress(email)
	if err != nil || address.Address != email || strings.ContainsAny(email, "\r\n") {
		return errors.New("invalid recipient")
	}
	port := env("MAILPIT_PORT", "1025")
	path, subject := "/verify-email", "Verify your Pocket Buddy email"
	if purpose == "reset" {
		path, subject = "/reset-password", "Reset your Pocket Buddy password"
	}
	// A fragment is not sent in HTTP requests or access logs.
	link := origin + path + "#token=" + token
	msg := []byte("From: Pocket Buddy <noreply@pocketbuddy.local>\r\nTo: " + email + "\r\nSubject: " + subject + "\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nOpen this link: " + link + "\r\nThis link expires in one hour.\r\n")
	addresses, err := net.LookupIP(host)
	if err != nil {
		return err
	}
	for _, ip := range addresses {
		if !ip.IsLoopback() && !ip.IsPrivate() {
			return errors.New("mail host must resolve to a local address")
		}
	}
	if len(addresses) == 0 {
		return errors.New("mail host has no address")
	}
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(addresses[0].String(), port), 5*time.Second)
	if err != nil {
		return err
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(5 * time.Second))
	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return err
	}
	defer client.Close()
	if err = client.Mail("noreply@pocketbuddy.local"); err != nil {
		return err
	}
	if err = client.Rcpt(email); err != nil {
		return err
	}
	writer, err := client.Data()
	if err != nil {
		return err
	}
	if _, err = writer.Write(msg); err != nil {
		return err
	}
	if err = writer.Close(); err != nil {
		return err
	}
	return client.Quit()
}

const verificationEmailCooldown = time.Minute

var authMailSender = sendLocalAuthMail

// Serialize token issuance and consumption per user across API instances.
func lockAuthTokens(tx *gorm.DB, userID string) error {
	return tx.Exec("SELECT pg_advisory_xact_lock(hashtextextended(?, 519))", userID).Error
}
func issueAuthToken(db *gorm.DB, userID, email, purpose, origin string) error {
	raw, err := randomSecret()
	if err != nil {
		return err
	}
	issued := false
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := lockAuthTokens(tx, userID); err != nil {
			return err
		}
		var user struct {
			ID              string
			EmailVerifiedAt *time.Time
		}
		if err := tx.Raw("SELECT id, email_verified_at FROM users WHERE id = ? AND deleted_at IS NULL FOR UPDATE", userID).Scan(&user).Error; err != nil {
			return err
		}
		if user.ID == "" || (purpose == "verify" && user.EmailVerifiedAt != nil) || (purpose == "reset" && user.EmailVerifiedAt == nil) {
			return nil
		}
		if purpose == "verify" {
			var recent int64
			if err := tx.Table("auth_tokens").Where("user_id = ? AND purpose = ? AND created_at > ?", userID, purpose, time.Now().UTC().Add(-verificationEmailCooldown)).Count(&recent).Error; err != nil {
				return err
			}
			if recent > 0 {
				return nil
			}
		}
		if err := tx.Exec("DELETE FROM auth_tokens WHERE user_id = ? AND purpose = ?", userID, purpose).Error; err != nil {
			return err
		}
		if err := tx.Exec("INSERT INTO auth_tokens (id,user_id,token_hash,purpose,expires_at) VALUES (?,?,?,?,?)", uuid.NewString(), userID, secretHash(raw), purpose, time.Now().UTC().Add(time.Hour)).Error; err != nil {
			return err
		}
		issued = true
		return nil
	})
	if err != nil {
		return err
	}
	if issued {
		sender := authMailSender
		go func() {
			if sender(email, purpose, raw, origin) != nil {
				// The failed token must not hold the resend cooldown.
				_ = db.Exec("DELETE FROM auth_tokens WHERE user_id = ? AND purpose = ? AND token_hash = ?", userID, purpose, secretHash(raw)).Error
			}
		}()
	}
	return nil
}

func requestAuthToken(db *gorm.DB, purpose, origin string) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			Email string `json:"email"`
		}
		if c.ShouldBindJSON(&input) != nil {
			c.JSON(400, gin.H{"error": "Enter an email address"})
			return
		}
		email := strings.ToLower(strings.TrimSpace(input.Email))
		var user authUser
		query := db.Table("users").Where("email = ? AND deleted_at IS NULL", email)
		if purpose == "verify" {
			query = query.Where("email_verified_at IS NULL")
		} else {
			query = query.Where("email_verified_at IS NOT NULL")
		}
		if query.Take(&user).Error == nil {
			_ = issueAuthToken(db, user.ID, user.Email, purpose, origin)
		}
		c.Status(http.StatusAccepted)
	}
}

var errInvalidAuthToken = errors.New("invalid auth token")

// Check the link without consuming it; tokens are sent in the request body, not URLs.
func checkAuthToken(db *gorm.DB, purpose string) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			Token string `json:"token"`
		}
		if c.ShouldBindJSON(&input) != nil || input.Token == "" {
			c.JSON(400, gin.H{"error": "Link is invalid or expired", "code": "invalid_link"})
			return
		}
		query := db.Table("auth_tokens AS t").Joins("JOIN users AS u ON u.id = t.user_id").Where("t.token_hash = ? AND t.purpose = ? AND t.expires_at > ? AND u.deleted_at IS NULL", secretHash(input.Token), purpose, time.Now().UTC())
		if purpose == "verify" {
			query = query.Where("u.email_verified_at IS NULL")
		} else {
			query = query.Where("u.email_verified_at IS NOT NULL")
		}
		var count int64
		if err := query.Count(&count).Error; err != nil {
			c.JSON(500, gin.H{"error": "Could not check the link. Try again."})
			return
		}
		if count == 0 {
			c.JSON(400, gin.H{"error": "Link is invalid or expired", "code": "invalid_link"})
			return
		}
		c.Status(http.StatusNoContent)
	}
}

func confirmAuthToken(db *gorm.DB, purpose string) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			Token    string `json:"token"`
			Password string `json:"password"`
		}
		if c.ShouldBindJSON(&input) != nil || input.Token == "" || len(input.Password) < 12 || len(input.Password) > 128 {
			c.JSON(400, gin.H{"error": "Enter a valid token and password"})
			return
		}
		passwordHash, err := hashPassword(input.Password)
		if err != nil {
			c.JSON(500, gin.H{"error": "Could not save password"})
			return
		}
		err = db.Transaction(func(tx *gorm.DB) error {
			hash := secretHash(input.Token)
			var candidate struct{ UserID string }
			if err := tx.Raw("SELECT user_id FROM auth_tokens WHERE token_hash = ? AND purpose = ? AND expires_at > ?", hash, purpose, time.Now().UTC()).Scan(&candidate).Error; err != nil {
				return err
			}
			if candidate.UserID == "" {
				return errInvalidAuthToken
			}
			if err := lockAuthTokens(tx, candidate.UserID); err != nil {
				return err
			}
			var user struct {
				ID              string
				EmailVerifiedAt *time.Time
			}
			if err := tx.Raw("SELECT id, email_verified_at FROM users WHERE id = ? AND deleted_at IS NULL FOR UPDATE", candidate.UserID).Scan(&user).Error; err != nil {
				return err
			}
			if user.ID == "" || (purpose == "verify" && user.EmailVerifiedAt != nil) || (purpose == "reset" && user.EmailVerifiedAt == nil) {
				return errInvalidAuthToken
			}
			var token struct{ ID string }
			if err := tx.Raw("SELECT id FROM auth_tokens WHERE user_id = ? AND token_hash = ? AND purpose = ? AND expires_at > ? FOR UPDATE", candidate.UserID, hash, purpose, time.Now().UTC()).Scan(&token).Error; err != nil {
				return err
			}
			if token.ID == "" {
				return errInvalidAuthToken
			}
			now := time.Now().UTC()
			if purpose == "verify" {
				if err := tx.Exec("UPDATE users SET password_hash = ?, email_verified_at = ?, updated_at = ? WHERE id = ?", passwordHash, now, now, user.ID).Error; err != nil {
					return err
				}
			} else {
				if err := tx.Exec("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", passwordHash, now, user.ID).Error; err != nil {
					return err
				}
			}
			if err := tx.Exec("DELETE FROM sessions WHERE user_id = ?", user.ID).Error; err != nil {
				return err
			}
			return tx.Exec("DELETE FROM auth_tokens WHERE user_id = ?", user.ID).Error
		})
		if errors.Is(err, errInvalidAuthToken) {
			c.JSON(400, gin.H{"error": "Link is invalid or expired", "code": "invalid_link"})
			return
		}
		if err != nil {
			c.JSON(500, gin.H{"error": "Could not save password. Try again."})
			return
		}
		c.Status(http.StatusNoContent)
	}
}

func deleteAccount(db *gorm.DB, secure bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		identity := c.MustGet("auth").(authContext)
		var input struct {
			Password string `json:"password"`
		}
		if c.ShouldBindJSON(&input) != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Enter your password"})
			return
		}
		var user authUser
		if db.Table("users").Where("id = ? AND deleted_at IS NULL", identity.UserID).Take(&user).Error != nil || !verifyPassword(input.Password, user.PasswordHash) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Password is incorrect"})
			return
		}
		err := db.Transaction(func(tx *gorm.DB) error {
			if err := lockCategoryChanges(tx, identity.UserID); err != nil {
				return err
			}
			now := time.Now().UTC()
			if err := tx.Exec("UPDATE users SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL", now, now, identity.UserID).Error; err != nil {
				return err
			}
			// Preserve any earlier transaction deletion and its original purge date.
			if err := tx.Exec("UPDATE transactions SET deleted_at = ?, purge_at = ? WHERE user_id = ? AND deleted_at IS NULL", now, now.Add(30*24*time.Hour), identity.UserID).Error; err != nil {
				return err
			}
			for _, table := range []string{"categories", "budgets", "recurring_transactions", "recurring_occurrences"} {
				if err := tx.Exec("UPDATE "+table+" SET deleted_at = ? WHERE user_id = ? AND deleted_at IS NULL", now, identity.UserID).Error; err != nil {
					return err
				}
			}
			if err := tx.Exec("DELETE FROM sessions WHERE user_id = ?", identity.UserID).Error; err != nil {
				return err
			}
			return tx.Exec("DELETE FROM auth_tokens WHERE user_id = ?", identity.UserID).Error
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not delete account"})
			return
		}
		clearAuthCookies(c, secure)
		c.Status(http.StatusNoContent)
	}
}

// Purges only explicitly deleted accounts, after their 30-day retention period.
// Foreign keys remove their associated records atomically.
func purgeDeletedAccounts(db *gorm.DB) error {
	return db.Exec("DELETE FROM users WHERE deleted_at IS NOT NULL AND deleted_at <= ?", time.Now().UTC().Add(-30*24*time.Hour)).Error
}

func startAccountPurge(db *gorm.DB) {
	go func() {
		for {
			if err := purgeDeletedAccounts(db); err != nil {
				fmt.Println("account retention cleanup failed")
			}
			time.Sleep(time.Hour)
		}
	}()
}
