package main

import (
	"errors"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"strings"
	"unicode/utf8"
)

type categoryInput struct {
	Name     string  `json:"name"`
	Kind     string  `json:"kind"`
	ParentID *string `json:"parentId"`
	Icon     string  `json:"icon"`
	Color    string  `json:"color"`
}
type categoryView struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Kind     string  `json:"kind"`
	ParentID *string `json:"parentId"`
	Icon     string  `json:"icon"`
	Color    string  `json:"color"`
}

var errCategoryInvalid = errors.New("invalid category")
var errCategoryMissing = errors.New("category not found")
var errCategoryConflict = errors.New("category conflict")

func lockCategoryChanges(db *gorm.DB, user string) error {
	if err := db.Exec("SELECT pg_advisory_xact_lock(hashtextextended(?, 518))", user).Error; err != nil {
		return err
	}
	var count int64
	if err := db.Table("users").Where("id = ? AND deleted_at IS NULL", user).Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return errCategoryMissing
	}
	return nil
}
func registerCategoryRoutes(auth *gin.RouterGroup, db *gorm.DB, origin string) {
	g := auth.Group("/categories")
	g.GET("", func(c *gin.Context) {
		rows := make([]categoryView, 0)
		if err := db.Table("categories").Select("id, name, kind, parent_id, COALESCE(icon, '') AS icon, COALESCE(color, '') AS color").Where("user_id = ? AND deleted_at IS NULL", c.MustGet("auth").(authContext).UserID).Order("lower(name), id").Scan(&rows).Error; err != nil {
			c.JSON(500, gin.H{"error": "Could not load categories"})
			return
		}
		c.JSON(200, gin.H{"categories": rows})
	})
	g.POST("", requireOrigin(origin), requireCSRF(), saveCategory(db, false))
	g.PUT("/:id", requireOrigin(origin), requireCSRF(), saveCategory(db, true))
	g.DELETE("/:id", requireOrigin(origin), requireCSRF(), deleteCategory(db))
}
func saveCategory(db *gorm.DB, update bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := c.MustGet("auth").(authContext).UserID
		var in categoryInput
		if c.ShouldBindJSON(&in) != nil {
			c.JSON(400, gin.H{"error": "Enter a valid category"})
			return
		}
		in.Name = strings.TrimSpace(in.Name)
		if in.Name == "" || utf8.RuneCountInString(in.Name) > 80 || (in.Kind != "income" && in.Kind != "expense") || len(in.Icon) > 40 || len(in.Color) > 40 {
			c.JSON(400, gin.H{"error": "Enter a valid category"})
			return
		}
		id := uuid.NewString()
		if update {
			id = c.Param("id")
			if _, err := uuid.Parse(id); err != nil {
				c.JSON(404, gin.H{"error": "Category not found"})
				return
			}
		}
		if in.ParentID != nil {
			if _, err := uuid.Parse(*in.ParentID); err != nil {
				c.JSON(400, gin.H{"error": "Invalid parent category"})
				return
			}
		}
		err := db.Transaction(func(tx *gorm.DB) error {
			if err := lockCategoryChanges(tx, user); err != nil {
				return err
			}
			var count int64
			if update {
				var old struct{ Kind string }
				result := tx.Table("categories").Select("kind").Where("id = ? AND user_id = ? AND deleted_at IS NULL", id, user).Take(&old)
				if errors.Is(result.Error, gorm.ErrRecordNotFound) {
					return errCategoryMissing
				}
				if result.Error != nil {
					return result.Error
				}
				if old.Kind != in.Kind {
					return errCategoryInvalid
				}
			}
			if err := tx.Table("categories").Where("user_id = ? AND kind = ? AND lower(name) = lower(?) AND deleted_at IS NULL AND id <> ?", user, in.Kind, in.Name, id).Count(&count).Error; err != nil {
				return err
			}
			if count > 0 {
				return errCategoryConflict
			}
			if in.ParentID != nil {
				if *in.ParentID == id {
					return errCategoryInvalid
				}
				if err := tx.Table("categories").Where("id = ? AND user_id = ? AND kind = ? AND parent_id IS NULL AND deleted_at IS NULL", *in.ParentID, user, in.Kind).Count(&count).Error; err != nil {
					return err
				}
				if count == 0 {
					return errCategoryInvalid
				}
				if update {
					if err := tx.Table("categories").Where("user_id = ? AND parent_id = ? AND deleted_at IS NULL", user, id).Count(&count).Error; err != nil {
						return err
					}
					if count > 0 {
						return errCategoryInvalid
					}
				}
			}
			if update {
				return tx.Table("categories").Where("id = ? AND user_id = ? AND deleted_at IS NULL", id, user).Updates(map[string]interface{}{"name": in.Name, "parent_id": in.ParentID, "icon": in.Icon, "color": in.Color}).Error
			}
			return tx.Exec("INSERT INTO categories (id,user_id,name,kind,parent_id,icon,color) VALUES (?,?,?,?,?,?,?)", id, user, in.Name, in.Kind, in.ParentID, in.Icon, in.Color).Error
		})
		switch {
		case errors.Is(err, errCategoryMissing):
			c.JSON(404, gin.H{"error": "Category not found"})
		case errors.Is(err, errCategoryConflict):
			c.JSON(409, gin.H{"error": "A category with this name already exists"})
		case errors.Is(err, errCategoryInvalid):
			c.JSON(400, gin.H{"error": "Invalid category or parent"})
		case err != nil:
			c.JSON(500, gin.H{"error": "Could not save category"})
		default:
			status := 201
			if update {
				status = 200
			}
			c.JSON(status, gin.H{"category": categoryView{id, in.Name, in.Kind, in.ParentID, in.Icon, in.Color}})
		}
	}
}
func deleteCategory(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		user, id := c.MustGet("auth").(authContext).UserID, c.Param("id")
		if _, err := uuid.Parse(id); err != nil {
			c.JSON(404, gin.H{"error": "Category not found"})
			return
		}
		err := db.Transaction(func(tx *gorm.DB) error {
			if err := lockCategoryChanges(tx, user); err != nil {
				return err
			}
			var count int64
			if err := tx.Table("categories").Where("id = ? AND user_id = ? AND deleted_at IS NULL", id, user).Count(&count).Error; err != nil {
				return err
			}
			if count == 0 {
				return errCategoryMissing
			}
			if err := tx.Table("budgets").Where("user_id = ? AND category_id = ? AND deleted_at IS NULL", user, id).Count(&count).Error; err != nil {
				return err
			}
			if count > 0 {
				return errCategoryConflict
			}
			if err := tx.Exec("UPDATE categories SET parent_id = NULL WHERE user_id = ? AND parent_id = ? AND deleted_at IS NULL", user, id).Error; err != nil {
				return err
			}
			if err := tx.Exec("UPDATE transactions SET category_id = NULL WHERE user_id = ? AND category_id = ?", user, id).Error; err != nil {
				return err
			}
			if err := tx.Exec("UPDATE recurring_transactions SET category_id = NULL WHERE user_id = ? AND category_id = ? AND deleted_at IS NULL", user, id).Error; err != nil {
				return err
			}
			return tx.Exec("UPDATE categories SET deleted_at = now() WHERE id = ? AND user_id = ? AND deleted_at IS NULL", id, user).Error
		})
		switch {
		case errors.Is(err, errCategoryMissing):
			c.JSON(404, gin.H{"error": "Category not found"})
		case errors.Is(err, errCategoryConflict):
			c.JSON(409, gin.H{"error": "Remove budgets using this category first"})
		case err != nil:
			c.JSON(500, gin.H{"error": "Could not delete category"})
		default:
			c.Status(204)
		}
	}
}
