package main

import (
	"errors"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type recurringRecord struct {
	ID             string     `json:"id"`
	UserID         string     `json:"-"`
	CategoryID     *string    `json:"categoryId"`
	Kind           string     `json:"kind"`
	Amount         int64      `json:"amount"`
	Description    string     `json:"description"`
	Frequency      string     `json:"frequency"`
	NextOccurrence time.Time  `json:"-"`
	AnchorDate     time.Time  `json:"-"`
	PausedAt       *time.Time `json:"-"`
	Merchant       string     `json:"merchant"`
	Note           string     `json:"note"`
}
type occurrenceRecord struct {
	ID                     string    `json:"id"`
	RecurringTransactionID string    `json:"scheduleId"`
	UserID                 string    `json:"-"`
	ScheduledDate          time.Time `json:"-"`
	Status                 string    `json:"status"`
	CategoryID             *string   `json:"categoryId"`
	Kind                   string    `json:"kind"`
	Amount                 int64     `json:"amount"`
	Description            string    `json:"description"`
	Merchant               string    `json:"merchant"`
	Note                   string    `json:"note"`
}
type recurringInput struct {
	Description string  `json:"description"`
	CategoryID  *string `json:"categoryId"`
	Kind        string  `json:"kind"`
	Amount      int64   `json:"amount"`
	Frequency   string  `json:"frequency"`
	NextDate    string  `json:"nextDate"`
	On          string  `json:"on"`
	Paused      bool    `json:"paused"`
}

func registerRecurringRoutes(auth *gin.RouterGroup, db *gorm.DB, origin string) {
	g := auth.Group("/recurring")
	g.GET("", listRecurring(db))
	g.POST("/sync", requireOrigin(origin), requireCSRF(), syncRecurring(db))
	g.POST("", requireOrigin(origin), requireCSRF(), saveRecurring(db, false))
	g.PUT("/:id", requireOrigin(origin), requireCSRF(), saveRecurring(db, true))
	g.DELETE("/:id", requireOrigin(origin), requireCSRF(), deleteRecurring(db))
	g.POST("/occurrences/:id/confirm", requireOrigin(origin), requireCSRF(), resolveOccurrence(db, true))
	g.POST("/occurrences/:id/skip", requireOrigin(origin), requireCSRF(), resolveOccurrence(db, false))
}
func listRecurring(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := c.MustGet("auth").(authContext).UserID
		var schedules []recurringRecord
		var occurrences []occurrenceRecord
		if db.Table("recurring_transactions").Where("user_id = ? AND deleted_at IS NULL", user).Order("next_occurrence, id").Scan(&schedules).Error != nil || db.Table("recurring_occurrences").Where("user_id = ? AND deleted_at IS NULL AND status = 'pending'", user).Order("scheduled_date, id").Scan(&occurrences).Error != nil {
			c.JSON(500, gin.H{"error": "Could not load schedules"})
			return
		}
		s := make([]gin.H, 0, len(schedules))
		for _, x := range schedules {
			s = append(s, gin.H{"id": x.ID, "description": x.Description, "categoryId": x.CategoryID, "kind": x.Kind, "amount": x.Amount, "frequency": x.Frequency, "nextDate": x.NextOccurrence.Format("2006-01-02"), "paused": x.PausedAt != nil})
		}
		o := make([]gin.H, 0, len(occurrences))
		for _, x := range occurrences {
			o = append(o, gin.H{"id": x.ID, "scheduleId": x.RecurringTransactionID, "description": x.Description, "categoryId": x.CategoryID, "kind": x.Kind, "amount": x.Amount, "date": x.ScheduledDate.Format("2006-01-02"), "merchant": x.Merchant, "note": x.Note})
		}
		c.JSON(200, gin.H{"schedules": s, "occurrences": o})
	}
}

// Materialize due dates under row locks so concurrent requests cannot duplicate them.
func materializeRecurring(tx *gorm.DB, user string, through time.Time) error {
	var rows []recurringRecord
	if err := tx.Table("recurring_transactions").Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ? AND deleted_at IS NULL AND paused_at IS NULL AND next_occurrence <= ?", user, through).Find(&rows).Error; err != nil {
		return err
	}
	for _, row := range rows {
		next := row.NextOccurrence
		for !next.After(through) {
			if err := tx.Exec(`INSERT INTO recurring_occurrences (id, recurring_transaction_id, user_id, scheduled_date, status, description, category_id, kind, amount, merchant, note) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?) ON CONFLICT (recurring_transaction_id, scheduled_date) DO NOTHING`, uuid.NewString(), row.ID, user, next, row.Description, row.CategoryID, row.Kind, row.Amount, row.Merchant, row.Note).Error; err != nil {
				return err
			}
			next = nextRecurringDate(next, row.AnchorDate, row.Frequency)
		}
		if err := tx.Table("recurring_transactions").Where("id = ? AND user_id = ?", row.ID, user).Update("next_occurrence", next).Error; err != nil {
			return err
		}
	}
	return nil
}
func syncRecurring(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			On string `json:"on"`
		}
		if c.ShouldBindJSON(&input) != nil {
			c.JSON(400, gin.H{"error": "Invalid date"})
			return
		}
		date, err := time.Parse("2006-01-02", input.On)
		if err != nil || date.Year() < 1900 || date.Year() > 2100 {
			c.JSON(400, gin.H{"error": "Invalid date"})
			return
		}
		// Do not let clients generate arbitrary future occurrences.
		now := time.Now().UTC()
		if date.After(now.Add(24 * time.Hour)) {
			c.JSON(400, gin.H{"error": "Invalid date"})
			return
		}
		if err = db.Transaction(func(tx *gorm.DB) error {
			user := c.MustGet("auth").(authContext).UserID
			if err := lockCategoryChanges(tx, user); err != nil {
				return err
			}
			return materializeRecurring(tx, user, date)
		}); err != nil {
			c.JSON(500, gin.H{"error": "Could not update occurrences"})
			return
		}
		c.Status(204)
	}
}
func saveRecurring(db *gorm.DB, update bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := c.MustGet("auth").(authContext).UserID
		var in recurringInput
		if c.ShouldBindJSON(&in) != nil {
			c.JSON(400, gin.H{"error": "Invalid schedule"})
			return
		}
		in.Description = strings.TrimSpace(in.Description)
		date, err := time.Parse("2006-01-02", in.NextDate)
		if err != nil || date.Year() < 1900 || date.Year() > 2100 || len(in.Description) == 0 || len(in.Description) > 120 || in.Amount <= 0 || in.Amount > 9007199254740991 || (in.Kind != "income" && in.Kind != "expense") || (in.Frequency != "weekly" && in.Frequency != "monthly" && in.Frequency != "yearly") {
			c.JSON(400, gin.H{"error": "Invalid schedule"})
			return
		}
		var on time.Time
		if in.On != "" {
			on, err = time.Parse("2006-01-02", in.On)
			if err != nil || on.Year() < 1900 || on.After(time.Now().UTC().Add(24*time.Hour)) {
				c.JSON(400, gin.H{"error": "Invalid date"})
				return
			}
		}
		if in.CategoryID != nil {
			if _, err := uuid.Parse(*in.CategoryID); err != nil {
				c.JSON(400, gin.H{"error": "Invalid category"})
				return
			}
		}
		id := uuid.NewString()
		if update {
			id = c.Param("id")
			if _, err := uuid.Parse(id); err != nil {
				c.JSON(404, gin.H{"error": "Schedule not found"})
				return
			}
		}
		err = db.Transaction(func(tx *gorm.DB) error {
			if err := lockCategoryChanges(tx, user); err != nil {
				return err
			}
			if in.CategoryID != nil {
				var n int64
				if err := tx.Table("categories").Where("id = ? AND user_id = ? AND kind = ? AND deleted_at IS NULL", *in.CategoryID, user, in.Kind).Count(&n).Error; err != nil {
					return err
				}
				if n == 0 {
					return errCategoryInvalid
				}
			}
			var paused interface{}
			if in.Paused {
				paused = time.Now().UTC()
			}
			values := map[string]interface{}{"description": in.Description, "category_id": in.CategoryID, "kind": in.Kind, "amount": in.Amount, "frequency": in.Frequency, "next_occurrence": date, "paused_at": paused, "updated_at": time.Now().UTC()}
			if update {
				var old recurringRecord
				if err := tx.Table("recurring_transactions").Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND user_id = ? AND deleted_at IS NULL", id, user).Take(&old).Error; err != nil {
					return err
				}
				if !on.IsZero() && old.PausedAt == nil {
					if err := materializeRecurring(tx, user, on); err != nil {
						return err
					}
					if old.NextOccurrence.Equal(date) && old.Frequency == in.Frequency {
						var advanced recurringRecord
						if err := tx.Table("recurring_transactions").Where("id = ? AND user_id = ?", id, user).Take(&advanced).Error; err != nil {
							return err
						}
						values["next_occurrence"] = advanced.NextOccurrence
					}
				}
				if !on.IsZero() && old.PausedAt != nil && !in.Paused && old.NextOccurrence.Equal(date) && old.Frequency == in.Frequency {
					for date.Before(on) {
						date = nextRecurringDate(date, old.AnchorDate, old.Frequency)
					}
					values["next_occurrence"] = date
				}
				if old.NextOccurrence.Format("2006-01-02") != in.NextDate || old.Frequency != in.Frequency {
					values["anchor_date"] = date
				}
				return tx.Table("recurring_transactions").Where("id = ? AND user_id = ?", id, user).Updates(values).Error
			}
			values["id"] = id
			values["user_id"] = user
			values["anchor_date"] = date
			return tx.Table("recurring_transactions").Create(values).Error
		})
		if errors.Is(err, errCategoryInvalid) {
			c.JSON(400, gin.H{"error": "Invalid category"})
			return
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(404, gin.H{"error": "Schedule not found"})
			return
		}
		if err != nil {
			c.JSON(500, gin.H{"error": "Could not save schedule"})
			return
		}
		c.Status(204)
	}
}
func deleteRecurring(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := c.MustGet("auth").(authContext).UserID
		id := c.Param("id")
		if _, err := uuid.Parse(id); err != nil {
			c.Status(404)
			return
		}
		err := db.Transaction(func(tx *gorm.DB) error {
			now := time.Now().UTC()
			result := tx.Table("recurring_transactions").Where("id = ? AND user_id = ? AND deleted_at IS NULL", id, user).Update("deleted_at", now)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected == 0 {
				return gorm.ErrRecordNotFound
			}
			return tx.Table("recurring_occurrences").Where("recurring_transaction_id = ? AND user_id = ? AND status = 'pending' AND deleted_at IS NULL", id, user).Update("deleted_at", now).Error
		})
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.Status(404)
			return
		}
		if err != nil {
			c.JSON(500, gin.H{"error": "Could not delete schedule"})
			return
		}
		c.Status(204)
	}
}
func resolveOccurrence(db *gorm.DB, confirm bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := c.MustGet("auth").(authContext).UserID
		id := c.Param("id")
		if _, err := uuid.Parse(id); err != nil {
			c.Status(404)
			return
		}
		var in transactionInput
		var date time.Time
		if confirm {
			if c.ShouldBindJSON(&in) != nil {
				c.JSON(400, gin.H{"error": "Invalid transaction"})
				return
			}
			var err error
			date, err = time.Parse("2006-01-02", in.Date)
			if err != nil || len(in.Description) > 120 || len(in.Merchant) > 120 || len(in.Note) > 2000 {
				c.JSON(400, gin.H{"error": "Invalid transaction"})
				return
			}
			if in.CategoryID != nil {
				if _, err := uuid.Parse(*in.CategoryID); err != nil {
					c.Status(400)
					return
				}
			}
		}
		err := db.Transaction(func(tx *gorm.DB) error {
			if err := lockCategoryChanges(tx, user); err != nil {
				return err
			}
			var row occurrenceRecord
			if err := tx.Table("recurring_occurrences").Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND user_id = ? AND status = 'pending' AND deleted_at IS NULL", id, user).Take(&row).Error; err != nil {
				return err
			}
			values := map[string]interface{}{"status": "skipped"}
			if confirm {
				if in.CategoryID != nil {
					var n int64
					if err := tx.Table("categories").Where("id = ? AND user_id = ? AND kind = ? AND deleted_at IS NULL", *in.CategoryID, user, in.Kind).Count(&n).Error; err != nil {
						return err
					}
					if n == 0 {
						return errCategoryInvalid
					}
				}
				item := Transaction{ID: uuid.NewString(), UserID: user, Description: in.Description, Kind: in.Kind, Amount: in.Amount, TransactionDate: date, CategoryID: in.CategoryID, Merchant: in.Merchant, Note: in.Note}
				if err := tx.Create(&item).Error; err != nil {
					return err
				}
				values["status"] = "confirmed"
				values["transaction_id"] = item.ID
			}
			return tx.Table("recurring_occurrences").Where("id = ? AND user_id = ?", id, user).Updates(values).Error
		})
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(404, gin.H{"error": "Occurrence is no longer pending"})
			return
		}
		if errors.Is(err, errCategoryInvalid) {
			c.JSON(400, gin.H{"error": "Invalid category"})
			return
		}
		if err != nil {
			c.JSON(500, gin.H{"error": "Could not update occurrence"})
			return
		}
		c.Status(204)
	}
}
