package main

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Profile values use minor units; changing currency does not convert stored amounts.
func registerProfileRoutes(r *gin.Engine, db *gorm.DB, origin string) {
	g := r.Group("/api")
	g.Use(loadSession(db))
	g.GET("/settings", func(c *gin.Context) {
		var user authUser
		if err := db.Table("users").Where("id = ?", c.MustGet("auth").(authContext).UserID).First(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not load settings"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"currency": user.Currency, "locale": user.Locale, "openingBalance": user.Opening, "transactionEntryDefault": user.TransactionEntryDefault})
	})
	g.PUT("/settings", requireOrigin(origin), requireCSRF(), func(c *gin.Context) {
		var input struct {
			Currency                string `json:"currency"`
			Locale                  string `json:"locale"`
			OpeningBalance          *int64 `json:"openingBalance"`
			TransactionEntryDefault string `json:"transactionEntryDefault"`
		}
		if c.ShouldBindJSON(&input) != nil || input.OpeningBalance == nil || (input.OpeningBalance != nil && (*input.OpeningBalance > 9007199254740991 || *input.OpeningBalance < -9007199254740991)) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Currency, locale and integer openingBalance are required"})
			return
		}
		input.Currency = strings.TrimSpace(input.Currency)
		if input.Currency != "IDR" || (input.Locale != "en" && input.Locale != "id-ID") || (input.TransactionEntryDefault != "manual" && input.TransactionEntryDefault != "scan") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid currency, locale or transaction entry default"})
			return
		}
		result := db.Table("users").Where("id = ?", c.MustGet("auth").(authContext).UserID).Updates(map[string]interface{}{"currency": input.Currency, "locale": input.Locale, "opening_balance": *input.OpeningBalance, "transaction_entry_default": input.TransactionEntryDefault})
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not save settings"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"currency": input.Currency, "locale": input.Locale, "openingBalance": *input.OpeningBalance, "transactionEntryDefault": input.TransactionEntryDefault})
	})
}
