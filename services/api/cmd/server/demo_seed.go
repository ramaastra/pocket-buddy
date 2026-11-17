package main

import (
	"fmt"
	"net/mail"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// seedDemoAccount provisions a separate, database-backed sample account once.
// Existing accounts are never reset, even when the configured email matches.
func seedDemoAccount(db *gorm.DB, email, password string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" && password == "" {
		return nil
	}
	address, err := mail.ParseAddress(email)
	if err != nil || address.Address != email || strings.ContainsAny(email, "\r\n") || len(email) > 254 || len(password) < 12 || len(password) > 128 {
		return fmt.Errorf("demo account configuration is invalid")
	}
	passwordHash, err := hashPassword(password)
	if err != nil {
		return fmt.Errorf("hash demo account password")
	}
	userID := uuid.NewString()
	verifiedAt := time.Now().UTC()
	user := authUser{
		ID: userID, Email: email, EmailVerifiedAt: &verifiedAt,
		PasswordHash: passwordHash, Currency: "IDR", Locale: "en",
		Opening: 5_000_000, TransactionEntryDefault: "manual",
	}
	return db.Transaction(func(tx *gorm.DB) error {
		result := tx.Table("users").Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "email"}}, DoNothing: true}).Create(&user)
		if result.Error != nil {
			return fmt.Errorf("create demo account")
		}
		if result.RowsAffected == 0 {
			return nil
		}
		return insertDemoData(tx, userID, time.Now().UTC())
	})
}

func insertDemoData(tx *gorm.DB, userID string, today time.Time) error {
	type demoCategory struct {
		id, name, kind, icon, color string
		parent                      *string
	}
	newCategory := func(name, kind, icon, color string, parent *string) demoCategory {
		return demoCategory{id: uuid.NewString(), name: name, kind: kind, icon: icon, color: color, parent: parent}
	}
	food := newCategory("Food & drink", "expense", "food", "coral", nil)
	groceries := newCategory("Groceries", "expense", "shopping", "lime", &food.id)
	home := newCategory("Home", "expense", "home", "violet", nil)
	transport := newCategory("Transport", "expense", "transport", "aqua", nil)
	fun := newCategory("Fun", "expense", "music", "pink", nil)
	salary := newCategory("Salary", "income", "money", "lime", nil)
	sideIncome := newCategory("Side income", "income", "work", "aqua", nil)
	categories := []demoCategory{food, groceries, home, transport, fun, salary, sideIncome}
	for _, category := range categories {
		if err := tx.Exec("INSERT INTO categories (id, user_id, parent_id, name, kind, icon, color) VALUES (?, ?, ?, ?, ?, ?, ?)", category.id, userID, category.parent, category.name, category.kind, category.icon, category.color).Error; err != nil {
			return fmt.Errorf("seed demo categories")
		}
	}
	type demoTransaction struct {
		name, kind, merchant, note string
		category                   string
		amount, daysAgo            int64
	}
	transactions := []demoTransaction{
		{"Monthly salary", "income", "Pocket Buddy Studio", "Monthly salary", salary.id, 8_500_000, 3},
		{"Coffee with Rani", "expense", "Kopi Kenangan", "", food.id, 28_000, 1},
		{"Ride to the office", "expense", "Grab", "", transport.id, 24_500, 2},
		{"Weekly groceries", "expense", "Super Indo", "", groceries.id, 186_200, 4},
		{"Internet bill", "expense", "First Media", "Home internet", home.id, 325_000, 6},
		{"Freelance project", "income", "", "Landing page project", sideIncome.id, 1_250_000, 8},
		{"Movie night", "expense", "Cinema XXI", "", fun.id, 115_000, 9},
		{"Lunch", "expense", "Warung Sederhana", "", food.id, 46_000, 10},
		{"Market vegetables", "expense", "Pasar Pagi", "", groceries.id, 82_500, 12},
		{"Ride home", "expense", "Gojek", "", transport.id, 31_000, 14},
	}
	for _, item := range transactions {
		date := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, -int(item.daysAgo))
		if err := tx.Exec(`INSERT INTO transactions (id, user_id, category_id, kind, amount, transaction_date, merchant, note, description)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, uuid.NewString(), userID, item.category, item.kind, item.amount, date, item.merchant, item.note, item.name).Error; err != nil {
			return fmt.Errorf("seed demo transactions")
		}
	}
	for _, budget := range []struct {
		category string
		amount   int64
		period   string
	}{{food.id, 2_000_000, "monthly"}, {home.id, 2_500_000, "monthly"}, {transport.id, 500_000, "weekly"}} {
		if err := tx.Exec("INSERT INTO budgets (id, user_id, category_id, amount, period, week_starts_on) VALUES (?, ?, ?, ?, ?, 1)", uuid.NewString(), userID, budget.category, budget.amount, budget.period).Error; err != nil {
			return fmt.Errorf("seed demo budgets")
		}
	}
	for _, schedule := range []struct {
		category, kind, description, frequency string
		amount                                 int64
		merchant                               string
		inDays                                 int
	}{{home.id, "expense", "Rent", "monthly", 3_000_000, "", 14}, {salary.id, "income", "Payday", "monthly", 8_500_000, "Employer", 20}} {
		next := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, schedule.inDays)
		if err := tx.Exec(`INSERT INTO recurring_transactions (id, user_id, category_id, kind, amount, merchant, note, frequency, next_occurrence, anchor_date, description)
			VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?)`, uuid.NewString(), userID, schedule.category, schedule.kind, schedule.amount, schedule.merchant, schedule.frequency, next, next, schedule.description).Error; err != nil {
			return fmt.Errorf("seed demo schedules")
		}
	}
	return nil
}
