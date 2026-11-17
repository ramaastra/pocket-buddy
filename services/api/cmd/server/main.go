package main

import (
	"database/sql"
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
	"gorm.io/gorm/logger"
	migrationfiles "pocket-buddy/services/api/migrations"
)

type User struct {
	ID             string `gorm:"type:uuid;primaryKey" json:"id"`
	Email          string `gorm:"uniqueIndex;not null" json:"email"`
	Name           string `gorm:"not null;default:''" json:"name"`
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
	Description     string    `json:"description"`
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
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		log.Fatalf("connect to PostgreSQL: %v", err)
	}
	if err := runMigrations(dsn); err != nil {
		log.Fatal(err)
	}
	if err := seedDemoAccount(db, os.Getenv("DEMO_ACCOUNT_EMAIL"), os.Getenv("DEMO_ACCOUNT_PASSWORD")); err != nil {
		log.Fatal("provision demo account: ", err)
	}

	startTransactionPurge(db)
	startAccountPurge(db)

	// Request URLs can contain financial search terms; avoid access logs.
	r := gin.New()
	r.Use(gin.CustomRecovery(func(c *gin.Context, _ interface{}) {
		log.Print("request failed unexpectedly")
		c.AbortWithStatus(http.StatusInternalServerError)
	}))
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
	registerProfileRoutes(r, db, webOrigin)
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

func runMigrations(dsn string) error {
	// The migration driver owns and closes its database handle. Use a separate
	// pool so closing the runner cannot close the application pool.
	migrationDB, err := sql.Open("pgx", dsn)
	if err != nil {
		return fmt.Errorf("open migration connection: %w", err)
	}
	// Do not let golang-migrate create its history table and apply 000001 to a
	// database created by the former AutoMigrate scaffold. Such a database
	// needs an explicit adoption review before any migration is recorded.
	if err := refuseUnversionedApplicationSchema(migrationDB); err != nil {
		migrationDB.Close()
		return err
	}
	driver, err := postgresmigrate.WithInstance(migrationDB, &postgresmigrate.Config{})
	if err != nil {
		migrationDB.Close()
		return fmt.Errorf("configure migration driver: %w", err)
	}
	source, err := iofs.New(migrationfiles.Files, ".")
	if err != nil {
		driver.Close()
		return fmt.Errorf("load database migrations: %w", err)
	}
	migrator, err := migrate.NewWithInstance("iofs", source, "postgres", driver)
	if err != nil {
		source.Close()
		driver.Close()
		return fmt.Errorf("configure database migrations: %w", err)
	}
	if err := migrator.Up(); err != nil && err != migrate.ErrNoChange {
		migrator.Close()
		return fmt.Errorf("apply database migrations: %w", err)
	}
	if sourceErr, dbErr := migrator.Close(); sourceErr != nil || dbErr != nil {
		return fmt.Errorf("close migration resources: source=%v database=%v", sourceErr, dbErr)
	}

	return nil
}

func refuseUnversionedApplicationSchema(db *sql.DB) error {
	var historyExists bool
	if err := db.QueryRow(`SELECT to_regclass('public.schema_migrations') IS NOT NULL`).Scan(&historyExists); err != nil {
		return fmt.Errorf("inspect migration history: %w", err)
	}
	var appTables int
	if err := db.QueryRow(`
		SELECT count(*)
		FROM information_schema.tables
		WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
		  AND table_name IN ('users', 'categories', 'transactions', 'budgets',
		                     'recurring_transactions', 'recurring_occurrences', 'sessions')
	`).Scan(&appTables); err != nil {
		return fmt.Errorf("inspect existing application tables: %w", err)
	}
	var historyHasRows bool
	if historyExists {
		if err := db.QueryRow(`SELECT EXISTS (SELECT 1 FROM public.schema_migrations)`).Scan(&historyHasRows); err != nil {
			return fmt.Errorf("inspect migration history contents: %w", err)
		}
	}
	if appTables > 0 && (!historyExists || !historyHasRows) {
		return fmt.Errorf("refusing to migrate an unversioned database containing %d Pocket Buddy table(s); back it up and follow docs/database-adoption.md before starting the API", appTables)
	}
	return nil
}

// Expired soft-deleted transactions are erased on startup and periodically
// while the API is running. Failed runs are retried on the next interval.
func startTransactionPurge(db *gorm.DB) {
	run := func() {
		if err := purgeExpiredTransactions(db, time.Now().UTC()); err != nil {
			log.Printf("transaction retention cleanup failed: %v", err)
		}
	}
	run()
	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			run()
		}
	}()
}
