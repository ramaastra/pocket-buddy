package main

import (
	"os"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// TEST_DATABASE_URL must point at a disposable, empty database. Migrations
// create tables in it; this test never drops or resets existing data.
func TestMigrationsLeaveApplicationPoolOpen(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to an isolated empty PostgreSQL database")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	pool, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err := runMigrations(dsn); err != nil {
		t.Fatal(err)
	}
	var count int64
	if err := db.Table("users").Count(&count).Error; err != nil {
		t.Fatalf("query after migration runner closed: %v", err)
	}
	if err := runMigrations(dsn); err != nil {
		t.Fatalf("rerun migrations: %v", err)
	}
}
