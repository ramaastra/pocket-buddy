package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/golang-migrate/migrate/v4"
	postgresmigrate "github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	migrationfiles "pocket-buddy/services/api/migrations"
)

type User struct {
	ID             string `gorm:"type:uuid;primaryKey" json:"id"`
	Email          string `gorm:"uniqueIndex;not null" json:"email"`
	Currency       string `gorm:"default:IDR" json:"currency"`
	Locale         string `gorm:"default:id-ID" json:"locale"`
	OpeningBalance int64  `gorm:"default:0" json:"openingBalance"`
}
type Category struct {
	ID       string  `gorm:"type:uuid;primaryKey" json:"id"`
	UserID   string  `gorm:"type:uuid;index;not null" json:"-"`
	ParentID *string `gorm:"type:uuid" json:"parentId"`
	Name     string  `gorm:"not null" json:"name"`
	Kind     string  `gorm:"not null" json:"kind"`
}
type Transaction struct {
	ID              string    `gorm:"type:uuid;primaryKey" json:"id"`
	UserID          string    `gorm:"type:uuid;index;not null" json:"-"`
	CategoryID      *string   `gorm:"type:uuid" json:"categoryId"`
	Kind            string    `gorm:"not null" json:"kind"`
	Amount          int64     `gorm:"not null" json:"amount"`
	TransactionDate time.Time `gorm:"type:date;not null;index" json:"date"`
	Merchant        string    `json:"merchant"`
	Note            string    `json:"note"`
	CreatedAt       time.Time `json:"createdAt"`
}

func main() {
	dsn := env("DATABASE_URL", "postgres://pocket_buddy:local_dev_only@localhost:5432/pocket_buddy?sslmode=disable")
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("connect to PostgreSQL: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("get PostgreSQL connection: %v", err)
	}
	driver, err := postgresmigrate.WithInstance(sqlDB, &postgresmigrate.Config{})
	if err != nil {
		log.Fatalf("configure migration driver: %v", err)
	}
	source, err := iofs.New(migrationfiles.Files, ".")
	if err != nil {
		log.Fatalf("load database migrations: %v", err)
	}
	migrator, err := migrate.NewWithInstance("iofs", source, "postgres", driver)
	if err != nil {
		log.Fatalf("configure database migrations: %v", err)
	}
	if err := migrator.Up(); err != nil && err != migrate.ErrNoChange {
		log.Fatalf("apply database migrations: %v", err)
	}
	if sourceErr, dbErr := migrator.Close(); sourceErr != nil || dbErr != nil {
		log.Printf("close migration resources: source=%v database=%v", sourceErr, dbErr)
	}

	r := gin.Default()
	if err := r.SetTrustedProxies(nil); err != nil {
		log.Fatalf("disable proxy header trust until trusted proxies are configured: %v", err)
	}
	corsConfig := cors.DefaultConfig()
	corsConfig.AllowOrigins = []string{env("WEB_ORIGIN", "http://localhost:3000")}
	corsConfig.AllowCredentials = true
	corsConfig.AllowMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
	corsConfig.AllowHeaders = []string{"Origin", "Content-Type", "Accept", "X-CSRF-Token"}
	r.Use(cors.New(corsConfig))
	r.GET("/api/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "pocket-buddy-api"}) })

	webOrigin := env("WEB_ORIGIN", "http://localhost:3000")
	secureCookies := env("COOKIE_SECURE", fmt.Sprintf("%t", strings.HasPrefix(webOrigin, "https://"))) == "true"
	registerAuthRoutes(r, db, webOrigin, secureCookies)
	if err := r.Run(":" + env("PORT", "8080")); err != nil {
		log.Fatal(err)
	}
}
func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
