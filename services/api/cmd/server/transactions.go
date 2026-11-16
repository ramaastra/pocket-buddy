package main

import (
	"encoding/csv"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type transactionInput struct {
	Description string  `json:"description"`
	Kind        string  `json:"kind" binding:"required,oneof=income expense"`
	Amount      int64   `json:"amount" binding:"required,gt=0,lte=9007199254740991"`
	Date        string  `json:"date" binding:"required"`
	CategoryID  *string `json:"categoryId"`
	Merchant    string  `json:"merchant"`
	Note        string  `json:"note"`
}

type transactionView struct {
	ID          string     `json:"id"`
	Description string     `json:"description"`
	CategoryID  *string    `json:"categoryId"`
	Kind        string     `json:"kind"`
	Amount      int64      `json:"amount"`
	Currency    string     `json:"currency"`
	Date        string     `json:"date"`
	Merchant    string     `json:"merchant"`
	Note        string     `json:"note"`
	CreatedAt   time.Time  `json:"createdAt"`
	DeletedAt   *time.Time `json:"deletedAt,omitempty"`
}

type transactionRow struct {
	Transaction
	Currency  string
	DeletedAt *time.Time
}

func (row transactionRow) view() transactionView {
	return transactionView{row.ID, row.Description, row.CategoryID, row.Kind, row.Amount, row.Currency, row.TransactionDate.Format("2006-01-02"), row.Merchant, row.Note, row.CreatedAt, row.DeletedAt}
}

func registerTransactionRoutes(auth *gin.RouterGroup, db *gorm.DB, origin string) {
	t := auth.Group("/transactions")
	t.GET("", listTransactions(db, false, false))
	t.GET("/export.csv", listTransactions(db, false, true))
	t.GET("/deleted", listTransactions(db, true, false))
	t.POST("", requireOrigin(origin), requireCSRF(), saveTransaction(db, false))
	t.PUT("/:id", requireOrigin(origin), requireCSRF(), saveTransaction(db, true))
	t.DELETE("/:id", requireOrigin(origin), requireCSRF(), deleteTransaction(db))
	t.POST("/:id/restore", requireOrigin(origin), requireCSRF(), restoreTransaction(db))
}

func listTransactions(db *gorm.DB, deleted, export bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := c.MustGet("auth").(authContext).UserID
		query := db.Table("transactions AS t").Joins("JOIN users AS u ON u.id = t.user_id").Where("t.user_id = ?", user)
		if deleted {
			query = query.Where("t.deleted_at IS NOT NULL AND t.purge_at > ?", time.Now().UTC())
		} else {
			query = query.Where("t.deleted_at IS NULL")
		}
		if kind := c.Query("kind"); kind != "" {
			if kind != "income" && kind != "expense" {
				c.JSON(400, gin.H{"error": "Invalid kind"})
				return
			}
			query = query.Where("t.kind = ?", kind)
		}
		if category := c.Query("category"); category != "" {
			if category == "uncategorized" {
				query = query.Where("t.category_id IS NULL")
			} else if _, err := uuid.Parse(category); err != nil {
				c.JSON(400, gin.H{"error": "Invalid category"})
				return
			} else {
				query = query.Where("t.category_id = ?", category)
			}
		}
		var dates [2]time.Time
		for i, key := range []string{"from", "to"} {
			if raw := c.Query(key); raw != "" {
				date, err := time.Parse("2006-01-02", raw)
				if err != nil {
					c.JSON(400, gin.H{"error": "Dates must use YYYY-MM-DD"})
					return
				}
				dates[i] = date
				if i == 0 {
					query = query.Where("t.transaction_date >= ?", date)
				} else {
					query = query.Where("t.transaction_date <= ?", date)
				}
			}
		}
		if !dates[0].IsZero() && !dates[1].IsZero() && dates[0].After(dates[1]) {
			c.JSON(400, gin.H{"error": "Start date must not be after end date"})
			return
		}
		if q := strings.TrimSpace(c.Query("q")); q != "" {
			if len(q) > 200 {
				c.JSON(400, gin.H{"error": "Search is too long"})
				return
			}
			escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(q)
			query = query.Where("(t.description ILIKE ? OR t.merchant ILIKE ? OR t.note ILIKE ?)", "%"+escaped+"%", "%"+escaped+"%", "%"+escaped+"%")
		}
		sorts := map[string]string{"date_desc": "t.transaction_date DESC, t.id DESC", "date_asc": "t.transaction_date ASC, t.id ASC", "amount_desc": "t.amount DESC, t.id DESC", "amount_asc": "t.amount ASC, t.id ASC", "deleted_desc": "t.deleted_at DESC, t.id DESC"}
		sort := c.Query("sort")
		if sort == "" {
			if deleted {
				sort = "deleted_desc"
			} else {
				sort = "date_desc"
			}
		}
		order, ok := sorts[sort]
		if !ok || (!deleted && sort == "deleted_desc") {
			c.JSON(400, gin.H{"error": "Invalid sort"})
			return
		}
		var total int64
		if err := query.Count(&total).Error; err != nil {
			c.JSON(500, gin.H{"error": "Could not load transactions"})
			return
		}
		page, limit := 1, 25
		if raw := c.Query("page"); raw != "" {
			n, err := strconv.Atoi(raw)
			if err != nil || n < 1 || n > 1000000 {
				c.JSON(400, gin.H{"error": "Invalid page"})
				return
			}
			page = n
		}
		if raw := c.Query("limit"); raw != "" {
			n, err := strconv.Atoi(raw)
			if err != nil || n < 1 || n > 100 {
				c.JSON(400, gin.H{"error": "Invalid limit"})
				return
			}
			limit = n
		}
		query = query.Select("t.*, u.currency AS currency").Order(order)
		if !export {
			query = query.Limit(limit).Offset((page - 1) * limit)
		}
		var rows []transactionRow
		if err := query.Scan(&rows).Error; err != nil {
			c.JSON(500, gin.H{"error": "Could not load transactions"})
			return
		}
		if export {
			c.Header("Content-Disposition", `attachment; filename="transactions.csv"`)
			c.Header("Content-Type", "text/csv; charset=utf-8")
			w := csv.NewWriter(c.Writer)
			_ = w.Write([]string{"date", "kind", "amount_minor", "currency", "category_id", "merchant", "note", "description"})
			for _, row := range rows {
				category := ""
				if row.CategoryID != nil {
					category = *row.CategoryID
				}
				_ = w.Write([]string{row.TransactionDate.Format("2006-01-02"), row.Kind, strconv.FormatInt(row.Amount, 10), row.Currency, csvSafe(category), csvSafe(row.Merchant), csvSafe(row.Note), csvSafe(row.Description)})
			}
			w.Flush()
			return
		}
		items := make([]transactionView, 0, len(rows))
		for _, row := range rows {
			items = append(items, row.view())
		}
		c.JSON(200, gin.H{"transactions": items, "total": total, "page": page, "limit": limit})
	}
}

// Prefix spreadsheet formula initiators in untrusted text fields.
func csvSafe(s string) string {
	if strings.HasPrefix(strings.TrimLeft(s, " \t\r\n"), "=") || strings.HasPrefix(strings.TrimLeft(s, " \t\r\n"), "+") || strings.HasPrefix(strings.TrimLeft(s, " \t\r\n"), "-") || strings.HasPrefix(strings.TrimLeft(s, " \t\r\n"), "@") {
		return "'" + s
	}
	return s
}

func saveTransaction(db *gorm.DB, update bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := c.MustGet("auth").(authContext).UserID
		var input transactionInput
		if c.ShouldBindJSON(&input) != nil {
			c.JSON(400, gin.H{"error": "Enter a valid transaction"})
			return
		}
		date, err := time.Parse("2006-01-02", input.Date)
		if err != nil {
			c.JSON(400, gin.H{"error": "Date must use YYYY-MM-DD"})
			return
		}
		if len(input.Description) > 120 || len(input.Merchant) > 120 || len(input.Note) > 2000 {
			c.JSON(400, gin.H{"error": "Description, merchant or note is too long"})
			return
		}
		if input.CategoryID != nil {
			if _, err := uuid.Parse(*input.CategoryID); err != nil {
				c.JSON(400, gin.H{"error": "Category is invalid"})
				return
			}
		}
		id := uuid.NewString()
		if update {
			id = c.Param("id")
			if _, err := uuid.Parse(id); err != nil {
				c.JSON(404, gin.H{"error": "Transaction not found"})
				return
			}
		}
		var row transactionRow
		err = db.Transaction(func(tx *gorm.DB) error {
			if err := lockCategoryChanges(tx, user); err != nil {
				return err
			}
			if input.CategoryID != nil {
				var count int64
				if err := tx.Table("categories").Where("id = ? AND user_id = ? AND kind = ? AND deleted_at IS NULL", *input.CategoryID, user, input.Kind).Count(&count).Error; err != nil {
					return err
				}
				if count == 0 {
					return errCategoryInvalid
				}
			}
			if update {
				result := tx.Table("transactions").Where("id = ? AND user_id = ? AND deleted_at IS NULL", id, user).Updates(map[string]interface{}{"description": input.Description, "kind": input.Kind, "amount": input.Amount, "transaction_date": date, "category_id": input.CategoryID, "merchant": input.Merchant, "note": input.Note, "updated_at": time.Now().UTC()})
				if result.Error != nil {
					return result.Error
				}
				if result.RowsAffected == 0 {
					return errCategoryMissing
				}
			} else {
				item := Transaction{ID: id, UserID: user, Description: input.Description, Kind: input.Kind, Amount: input.Amount, TransactionDate: date, CategoryID: input.CategoryID, Merchant: input.Merchant, Note: input.Note}
				if err := tx.Create(&item).Error; err != nil {
					return err
				}
			}
			return tx.Table("transactions AS t").Select("t.*, u.currency AS currency").Joins("JOIN users AS u ON u.id = t.user_id").Where("t.id = ? AND t.user_id = ?", id, user).Scan(&row).Error
		})
		if errors.Is(err, errCategoryInvalid) {
			c.JSON(400, gin.H{"error": "Category is invalid for this transaction"})
			return
		}
		if errors.Is(err, errCategoryMissing) {
			c.JSON(404, gin.H{"error": "Transaction not found"})
			return
		}
		if err != nil {
			c.JSON(500, gin.H{"error": "Could not save transaction"})
			return
		}
		status := http.StatusCreated
		if update {
			status = http.StatusOK
		}
		c.JSON(status, gin.H{"transaction": row.view()})
	}
}
func deleteTransaction(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		if _, err := uuid.Parse(id); err != nil {
			c.JSON(404, gin.H{"error": "Transaction not found"})
			return
		}
		now := time.Now().UTC()
		result := db.Table("transactions").Where("id = ? AND user_id = ? AND deleted_at IS NULL", id, c.MustGet("auth").(authContext).UserID).Updates(map[string]interface{}{"deleted_at": now, "purge_at": now.Add(30 * 24 * time.Hour)})
		if result.Error != nil {
			c.JSON(500, gin.H{"error": "Could not delete transaction"})
			return
		}
		if result.RowsAffected == 0 {
			c.JSON(404, gin.H{"error": "Transaction not found"})
			return
		}
		c.Status(204)
	}
}
func restoreTransaction(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		if _, err := uuid.Parse(id); err != nil {
			c.JSON(404, gin.H{"error": "Transaction not found"})
			return
		}
		result := db.Table("transactions").Where("id = ? AND user_id = ? AND deleted_at IS NOT NULL AND purge_at > ?", id, c.MustGet("auth").(authContext).UserID, time.Now().UTC()).Updates(map[string]interface{}{"deleted_at": nil, "purge_at": nil})
		if result.Error != nil {
			c.JSON(500, gin.H{"error": "Could not restore transaction"})
			return
		}
		if result.RowsAffected == 0 {
			c.JSON(404, gin.H{"error": "Transaction not found or restore period expired"})
			return
		}
		c.Status(204)
	}
}

// purgeExpiredTransactions permanently removes records past their recovery window.
func purgeExpiredTransactions(db *gorm.DB, now time.Time) error {
	return db.Exec("DELETE FROM transactions WHERE deleted_at IS NOT NULL AND purge_at <= ?", now).Error
}
