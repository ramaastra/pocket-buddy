package main

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type budgetInput struct {
	CategoryID string `json:"categoryId"`
	Amount     int64  `json:"amount"`
	Period     string `json:"period"`
}

type budgetRow struct {
	ID         string `json:"id"`
	CategoryID string `json:"categoryId"`
	Amount     int64  `json:"amount"`
	Period     string `json:"period"`
}

type budgetView struct {
	budgetRow
	Spent       int64  `json:"spent"`
	PeriodStart string `json:"periodStart"`
	PeriodEnd   string `json:"periodEnd"`
}

var errBudgetMissing = errors.New("budget not found")
var errBudgetCategory = errors.New("invalid budget category")
var errBudgetConflict = errors.New("budget already exists")

func registerBudgetRoutes(auth *gin.RouterGroup, db *gorm.DB, origin string) {
	g := auth.Group("/budgets")
	g.GET("", listBudgets(db))
	g.POST("", requireOrigin(origin), requireCSRF(), saveBudget(db, false))
	g.PUT("/:id", requireOrigin(origin), requireCSRF(), saveBudget(db, true))
	g.DELETE("/:id", requireOrigin(origin), requireCSRF(), deleteBudget(db))
}

// Budget periods use calendar dates. Weekly periods begin on Monday.
func budgetWindow(period string, on time.Time) (time.Time, time.Time) {
	on = time.Date(on.Year(), on.Month(), on.Day(), 0, 0, 0, 0, time.UTC)
	if period == "weekly" {
		start := on.AddDate(0, 0, -((int(on.Weekday()) + 6) % 7))
		return start, start.AddDate(0, 0, 7)
	}
	start := time.Date(on.Year(), on.Month(), 1, 0, 0, 0, 0, time.UTC)
	return start, start.AddDate(0, 1, 0)
}

func listBudgets(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		on := time.Now().UTC()
		if raw := c.Query("on"); raw != "" {
			parsed, err := time.Parse("2006-01-02", raw)
			if err != nil || parsed.Format("2006-01-02") != raw {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Date must use YYYY-MM-DD"})
				return
			}
			on = parsed
		}
		user := c.MustGet("auth").(authContext).UserID
		rows := make([]budgetRow, 0)
		if err := db.Table("budgets").Select("id, category_id, amount, period").Where("user_id = ? AND deleted_at IS NULL", user).Order("created_at, id").Scan(&rows).Error; err != nil {
			c.JSON(500, gin.H{"error": "Could not load budgets"})
			return
		}
		items := make([]budgetView, 0, len(rows))
		for _, row := range rows {
			start, end := budgetWindow(row.Period, on)
			var spent int64
			err := db.Table("transactions AS t").Select("COALESCE(SUM(t.amount), 0)").Joins("LEFT JOIN categories AS c ON c.id = t.category_id AND c.user_id = t.user_id").Where("t.user_id = ? AND t.kind = 'expense' AND t.deleted_at IS NULL AND t.transaction_date >= ? AND t.transaction_date < ? AND (t.category_id = ? OR c.parent_id = ?)", user, start, end, row.CategoryID, row.CategoryID).Scan(&spent).Error
			if err != nil {
				c.JSON(500, gin.H{"error": "Could not load budget spending"})
				return
			}
			items = append(items, budgetView{row, spent, start.Format("2006-01-02"), end.AddDate(0, 0, -1).Format("2006-01-02")})
		}
		c.JSON(200, gin.H{"budgets": items})
	}
}

func saveBudget(db *gorm.DB, update bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var in budgetInput
		if c.ShouldBindJSON(&in) != nil || in.Amount <= 0 || in.Amount > 9007199254740991 || (in.Period != "weekly" && in.Period != "monthly") {
			c.JSON(400, gin.H{"error": "Enter a valid budget"})
			return
		}
		if _, err := uuid.Parse(in.CategoryID); err != nil {
			c.JSON(400, gin.H{"error": "Choose an expense category"})
			return
		}
		id := uuid.NewString()
		if update {
			id = c.Param("id")
			if _, err := uuid.Parse(id); err != nil {
				c.JSON(404, gin.H{"error": "Budget not found"})
				return
			}
		}
		user := c.MustGet("auth").(authContext).UserID
		err := db.Transaction(func(tx *gorm.DB) error {
			if err := lockCategoryChanges(tx, user); err != nil {
				return err
			}
			var count int64
			if update {
				if err := tx.Table("budgets").Where("id = ? AND user_id = ? AND deleted_at IS NULL", id, user).Count(&count).Error; err != nil {
					return err
				}
				if count == 0 {
					return errBudgetMissing
				}
			}
			if err := tx.Table("categories").Where("id = ? AND user_id = ? AND kind = 'expense' AND deleted_at IS NULL", in.CategoryID, user).Count(&count).Error; err != nil {
				return err
			}
			if count == 0 {
				return errBudgetCategory
			}
			if err := tx.Table("budgets").Where("user_id = ? AND category_id = ? AND period = ? AND deleted_at IS NULL AND id <> ?", user, in.CategoryID, in.Period, id).Count(&count).Error; err != nil {
				return err
			}
			if count > 0 {
				return errBudgetConflict
			}
			if update {
				return tx.Table("budgets").Where("id = ? AND user_id = ? AND deleted_at IS NULL", id, user).Updates(map[string]interface{}{"category_id": in.CategoryID, "amount": in.Amount, "period": in.Period, "week_starts_on": 1, "updated_at": time.Now().UTC()}).Error
			}
			return tx.Exec("INSERT INTO budgets (id,user_id,category_id,amount,period,week_starts_on) VALUES (?,?,?,?,?,1)", id, user, in.CategoryID, in.Amount, in.Period).Error
		})
		switch {
		case errors.Is(err, errBudgetMissing):
			c.JSON(404, gin.H{"error": "Budget not found"})
		case errors.Is(err, errBudgetCategory):
			c.JSON(400, gin.H{"error": "Choose an active expense category"})
		case errors.Is(err, errBudgetConflict):
			c.JSON(409, gin.H{"error": "A budget already exists for this category and period"})
		case err != nil:
			c.JSON(500, gin.H{"error": "Could not save budget"})
		default:
			status := 201
			if update {
				status = 200
			}
			c.JSON(status, gin.H{"budget": budgetRow{id, in.CategoryID, in.Amount, in.Period}})
		}
	}
}

func deleteBudget(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		if _, err := uuid.Parse(id); err != nil {
			c.JSON(404, gin.H{"error": "Budget not found"})
			return
		}
		user := c.MustGet("auth").(authContext).UserID
		result := db.Table("budgets").Where("id = ? AND user_id = ? AND deleted_at IS NULL", id, user).Updates(map[string]interface{}{"deleted_at": time.Now().UTC(), "updated_at": time.Now().UTC()})
		if result.Error != nil {
			c.JSON(500, gin.H{"error": "Could not remove budget"})
			return
		}
		if result.RowsAffected == 0 {
			c.JSON(404, gin.H{"error": "Budget not found"})
			return
		}
		c.Status(204)
	}
}
