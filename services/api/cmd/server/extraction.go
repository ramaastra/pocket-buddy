package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const maxExtractionImage = 8 << 20

type extractedDraft struct {
	Description string   `json:"description"`
	Kind        string   `json:"kind"`
	Amount      int64    `json:"amount"`
	Date        string   `json:"date"`
	Merchant    string   `json:"merchant"`
	Note        string   `json:"note"`
	Category    string   `json:"category"`
	Uncertain   []string `json:"uncertainFields"`
}

type transactionDraftExtractor interface {
	Extract(context.Context, string, []byte, string, string) ([]extractedDraft, error)
}

type geminiDraftExtractor struct{ key, model string }

func (g geminiDraftExtractor) Extract(ctx context.Context, mimeType string, image []byte, categories, currency string) ([]extractedDraft, error) {
	return requestGeminiExtraction(ctx, g.key, g.model, mimeType, image, categories, currency)
}

func registerExtractionRoutes(auth *gin.RouterGroup, db *gorm.DB, origin string) {
	auth.POST("/transactions/extract", authRateLimitFor("extract", 5), requireOrigin(origin), requireCSRF(), extractTransactions(db))
}

func extractTransactions(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := strings.TrimSpace(os.Getenv("GEMINI_API_KEY"))
		if key == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Receipt extraction is not configured yet"})
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxExtractionImage+(1<<20))
		if err := c.Request.ParseMultipartForm(32 << 20); err != nil {
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "Choose an image smaller than 8 MB"})
				return
			}
			c.JSON(http.StatusBadRequest, gin.H{"error": "Choose one image to extract"})
			return
		}
		if c.Request.MultipartForm == nil || len(c.Request.MultipartForm.File) != 1 || len(c.Request.MultipartForm.File["image"]) != 1 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Choose one image to extract"})
			return
		}
		defer c.Request.MultipartForm.RemoveAll()
		file, header, err := c.Request.FormFile("image")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Choose one image to extract"})
			return
		}
		defer file.Close()
		if header.Size <= 0 || header.Size > maxExtractionImage {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "Choose an image smaller than 8 MB"})
			return
		}
		imageBytes, err := io.ReadAll(io.LimitReader(file, maxExtractionImage+1))
		if err != nil || len(imageBytes) == 0 || len(imageBytes) > maxExtractionImage {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Could not read that image"})
			return
		}
		contentType := http.DetectContentType(imageBytes)
		mediaType, _, _ := mime.ParseMediaType(contentType)
		if mediaType != "image/jpeg" && mediaType != "image/png" && mediaType != "image/webp" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Use a JPEG, PNG, or WEBP image"})
			return
		}

		var categories []Category
		userID := c.MustGet("auth").(authContext).UserID
		var currency string
		if err := db.Table("users").Select("currency").Where("id = ?", userID).Scan(&currency).Error; err != nil || !supportedCurrency(currency) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not prepare extraction"})
			return
		}
		if err := db.Table("categories").Select("id, name, kind").Where("user_id = ? AND deleted_at IS NULL", userID).Order("lower(name), id").Scan(&categories).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not prepare extraction"})
			return
		}
		categoryNames := make([]string, 0, len(categories))
		for _, category := range categories {
			categoryNames = append(categoryNames, fmt.Sprintf("%s (%s)", category.Name, category.Kind))
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 50*time.Second)
		defer cancel()
		var extractor transactionDraftExtractor = geminiDraftExtractor{key: key, model: env("GEMINI_MODEL", "gemini-3.5-flash-lite")}
		drafts, err := extractor.Extract(ctx, mediaType, imageBytes, strings.Join(categoryNames, ", "), currency)
		if err != nil {
			var providerErr *geminiAPIError
			if errors.As(err, &providerErr) && providerErr.StatusCode == http.StatusServiceUnavailable {
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": "The scan service is busy right now. Wait a moment and try again."})
				return
			}
			if errors.As(err, &providerErr) && providerErr.StatusCode == http.StatusTooManyRequests {
				c.JSON(http.StatusTooManyRequests, gin.H{"error": "The scan service is receiving too many requests. Wait a moment and try again."})
				return
			}
			c.JSON(http.StatusBadGateway, gin.H{"error": "The scan couldn’t finish. Try again or enter the transaction manually."})
			return
		}
		c.JSON(http.StatusOK, gin.H{"drafts": drafts})
	}
}

type geminiAPIError struct{ StatusCode int }

func (e *geminiAPIError) Error() string { return fmt.Sprintf("Gemini returned HTTP %d", e.StatusCode) }

type geminiRequest struct {
	Contents []struct {
		Role  string `json:"role"`
		Parts []any  `json:"parts"`
	} `json:"contents"`
	GenerationConfig map[string]any `json:"generationConfig"`
}

func requestGeminiExtraction(ctx context.Context, key, model, mimeType string, image []byte, categories, currency string) ([]extractedDraft, error) {
	digits := 2
	if currency == "IDR" {
		digits = 0
	}
	prompt := fmt.Sprintf("Read the provided receipt, order confirmation, or financial transaction screenshot. The account display currency is %s; return amounts as integer minor units with %d decimal places per major unit. Return only transactions clearly represented in it; do not invent missing values. For a retail receipt representing one purchase, create one draft for the final TOTAL paid after discounts, not separate drafts for each product line. Put the purchased items in that draft's note as concise newline-separated lines. Include each readable item name and quantity when shown; include options or modifiers and item prices when legible and space allows. Do not include subtotal, tax, service fees, cash tendered, or change as purchased items, and do not make separate transactions for them. Keep the note within 500 characters and omit unreadable details rather than guessing. Do not treat cash tendered or change as a transaction. For bank or payment screenshots with multiple independent transaction rows, create one draft per transaction. If the amount cannot be represented confidently in the account currency, use 0 and mark amount uncertain. Interpret Indonesian receipt dates as DD/MM/YYYY and use YYYY-MM-DD in the output; if the date is absent or ambiguous, use an empty string and mark date uncertain. Choose kind only as income or expense. Choose category only from this account list, matching its kind; otherwise use an empty string. Description should be short. Return JSON exactly as {\"drafts\":[{\"description\":string,\"kind\":\"income\"|\"expense\",\"amount\":integer,\"date\":string,\"merchant\":string,\"note\":string,\"category\":string,\"uncertainFields\":string[]}]} . uncertainFields may contain description, kind, amount, date, merchant, or category. Account categories: %s", currency, digits, categories)
	data, err := json.Marshal(map[string]any{"contents": []any{map[string]any{"role": "user", "parts": []any{map[string]any{"text": prompt}, map[string]any{"inline_data": map[string]any{"mime_type": mimeType, "data": base64.StdEncoding.EncodeToString(image)}}}}}, "generationConfig": map[string]any{"responseMimeType": "application/json"}})
	if err != nil {
		return nil, err
	}
	url := "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent"
	client := &http.Client{Timeout: 45 * time.Second}
	var resp *http.Response
	for attempt := 0; attempt < 2; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(data))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("x-goog-api-key", key)
		resp, err = client.Do(req)
		if err != nil {
			return nil, err
		}
		if resp.StatusCode != http.StatusServiceUnavailable || attempt == 1 {
			break
		}
		resp.Body.Close()
		timer := time.NewTimer(750 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil, ctx.Err()
		case <-timer.C:
		}
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, &geminiAPIError{StatusCode: resp.StatusCode}
	}
	var result struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&result); err != nil || len(result.Candidates) == 0 || len(result.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("invalid extraction response")
	}
	var output struct {
		Drafts []extractedDraft `json:"drafts"`
	}
	if err := json.Unmarshal([]byte(result.Candidates[0].Content.Parts[0].Text), &output); err != nil || len(output.Drafts) > 50 {
		return nil, fmt.Errorf("invalid draft data")
	}
	for i := range output.Drafts {
		d := &output.Drafts[i]
		d.Description = cleanExtracted(d.Description, 160)
		d.Merchant = cleanExtracted(d.Merchant, 120)
		d.Note = cleanExtracted(d.Note, 500)
		d.Category = cleanExtracted(d.Category, 80)
		if d.Kind != "income" && d.Kind != "expense" {
			d.Kind = "expense"
			d.Uncertain = append(d.Uncertain, "kind")
		}
		if d.Amount <= 0 || d.Amount > 1_000_000_000_000 {
			d.Amount = 0
			d.Uncertain = append(d.Uncertain, "amount")
		}
		if d.Description == "" {
			d.Uncertain = append(d.Uncertain, "description")
		}
		if _, err := time.Parse("2006-01-02", d.Date); err != nil {
			d.Date = ""
			d.Uncertain = append(d.Uncertain, "date")
		}
		allowed := map[string]bool{"description": true, "kind": true, "amount": true, "date": true, "merchant": true, "category": true}
		filtered := d.Uncertain[:0]
		for _, field := range d.Uncertain {
			if allowed[field] {
				filtered = append(filtered, field)
			}
		}
		d.Uncertain = filtered
	}
	return output.Drafts, nil
}

func cleanExtracted(value string, max int) string {
	value = strings.TrimSpace(strings.ToValidUTF8(value, ""))
	runes := []rune(value)
	if len(runes) > max {
		value = string(runes[:max])
	}
	return value
}
