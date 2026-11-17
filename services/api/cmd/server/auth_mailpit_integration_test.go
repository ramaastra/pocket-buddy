package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

const authMailpitOrigin = "http://auth-test.local"

type mailpitAddress struct {
	Address string
}

type mailpitMessageSummary struct {
	ID      string
	To      []mailpitAddress
	Subject string
}

type mailpitMessageList struct {
	Messages []mailpitMessageSummary
}

type mailpitMessage struct {
	Text string
	HTML string
}

// TestAuthMailpitEndToEnd exercises the real registration and password-reset
// mail path. It is opt-in because it needs a disposable PostgreSQL database
// and a local Mailpit instance with its SMTP and HTTP ports exposed.
func TestAuthMailpitEndToEnd(t *testing.T) {
	if os.Getenv("TEST_MAILPIT") != "true" {
		t.Skip("set TEST_MAILPIT=true to run the local Mailpit auth integration")
	}
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to a disposable PostgreSQL database")
	}

	apiURL := env("TEST_MAILPIT_API_URL", "http://127.0.0.1:8025/api/v1")
	if err := validateLocalMailpitURL(apiURL); err != nil {
		t.Fatal(err)
	}
	mailpitClient := &http.Client{Timeout: 5 * time.Second}
	initialMessages, err := listMailpitMessages(mailpitClient, apiURL)
	if err != nil {
		t.Fatalf("connect to Mailpit: %v", err)
	}
	initialIDs := make(map[string]struct{}, len(initialMessages))
	for _, message := range initialMessages {
		initialIDs[message.ID] = struct{}{}
	}

	if err := runMigrations(dsn); err != nil {
		t.Fatal(err)
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	pool, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = pool.Close() })

	email := uuid.NewString() + "@example.test"
	t.Cleanup(func() {
		if err := db.Exec("DELETE FROM users WHERE email = ?", email).Error; err != nil {
			t.Errorf("remove temporary auth account")
		}
	})

	testSMTPPort := env("TEST_MAILPIT_SMTP_PORT", "1025")
	if _, err := net.LookupPort("tcp", testSMTPPort); err != nil {
		t.Fatalf("invalid TEST_MAILPIT_SMTP_PORT")
	}
	t.Setenv("MAILPIT_HOST", "127.0.0.1")
	t.Setenv("MAILPIT_PORT", testSMTPPort)
	authMailSender = sendLocalAuthMail
	t.Cleanup(func() { authMailSender = sendLocalAuthMail })

	oldGinMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(oldGinMode) })
	router := gin.New()
	registerAuthRoutes(router, db, authMailpitOrigin, false)

	testID, err := uuid.NewRandom()
	if err != nil {
		t.Fatal(err)
	}
	remoteAddr := net.JoinHostPort(net.IPv4(198, 18, testID[0], testID[1]).String(), "31415")
	request := func(method, path string, body any, cookies, csrf string) *httptest.ResponseRecorder {
		t.Helper()
		var requestBody io.Reader
		if body != nil {
			encoded, err := json.Marshal(body)
			if err != nil {
				t.Fatal(err)
			}
			requestBody = bytes.NewReader(encoded)
		}
		q := httptest.NewRequest(method, path, requestBody)
		q.RemoteAddr = remoteAddr
		q.Header.Set("Origin", authMailpitOrigin)
		if body != nil {
			q.Header.Set("Content-Type", "application/json")
		}
		if cookies != "" {
			q.Header.Set("Cookie", cookies)
		}
		if csrf != "" {
			q.Header.Set("X-CSRF-Token", csrf)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, q)
		return w
	}
	assertStatus := func(stage string, response *httptest.ResponseRecorder, expected int) {
		t.Helper()
		if response.Code != expected {
			t.Fatalf("%s returned HTTP %d; want %d", stage, response.Code, expected)
		}
	}

	cleanupMessages := func() {
		messages, err := listMailpitMessages(mailpitClient, apiURL)
		if err != nil {
			t.Errorf("list Mailpit messages during cleanup")
			return
		}
		var ids []string
		for _, message := range messages {
			if _, existed := initialIDs[message.ID]; existed || !mailpitMessageTo(message, email) {
				continue
			}
			ids = append(ids, message.ID)
		}
		if err := deleteMailpitMessages(mailpitClient, apiURL, ids); err != nil {
			t.Errorf("remove temporary auth messages from Mailpit")
		}
	}
	t.Cleanup(cleanupMessages)

	response := request(http.MethodPost, "/api/auth/register", map[string]string{"email": email, "name": "Mailpit Integration"}, "", "")
	assertStatus("registration", response, http.StatusCreated)
	verificationToken, err := waitForMailpitToken(t, mailpitClient, apiURL, initialIDs, email, "verify")
	if err != nil {
		t.Fatal(err)
	}
	response = request(http.MethodPost, "/api/auth/verification/check", map[string]string{"token": verificationToken}, "", "")
	assertStatus("verification link check", response, http.StatusNoContent)

	password := "Mailpit-Integration-Password-2026"
	response = request(http.MethodPost, "/api/auth/verification/confirm", map[string]string{"token": verificationToken, "password": password}, "", "")
	assertStatus("email verification", response, http.StatusNoContent)
	response = request(http.MethodPost, "/api/auth/verification/check", map[string]string{"token": verificationToken}, "", "")
	assertStatus("verification token reuse", response, http.StatusBadRequest)

	response = request(http.MethodPost, "/api/auth/login", map[string]string{"email": email, "password": password}, "", "")
	assertStatus("sign-in after verification", response, http.StatusOK)
	var session struct {
		CSRFToken string `json:"csrfToken"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &session); err != nil || session.CSRFToken == "" {
		t.Fatal("sign-in response did not include a CSRF token")
	}
	cookies := responseCookies(response)
	if !strings.Contains(cookies, sessionCookieName+"=") || !strings.Contains(cookies, csrfCookieName+"=") {
		t.Fatal("sign-in did not issue session and CSRF cookies")
	}
	response = request(http.MethodGet, "/api/auth/me", nil, cookies, "")
	assertStatus("authenticated account lookup", response, http.StatusOK)

	response = request(http.MethodPost, "/api/auth/password-reset/request", map[string]string{"email": email}, "", "")
	assertStatus("password-reset request", response, http.StatusAccepted)
	resetToken, err := waitForMailpitToken(t, mailpitClient, apiURL, initialIDs, email, "reset")
	if err != nil {
		t.Fatal(err)
	}
	response = request(http.MethodPost, "/api/auth/password-reset/check", map[string]string{"token": resetToken}, "", "")
	assertStatus("password-reset link check", response, http.StatusNoContent)

	newPassword := "Mailpit-Integration-Password-Changed-2026"
	response = request(http.MethodPost, "/api/auth/password-reset/confirm", map[string]string{"token": resetToken, "password": newPassword}, "", "")
	assertStatus("password reset", response, http.StatusNoContent)
	response = request(http.MethodPost, "/api/auth/password-reset/check", map[string]string{"token": resetToken}, "", "")
	assertStatus("password-reset token reuse", response, http.StatusBadRequest)
	response = request(http.MethodPost, "/api/auth/login", map[string]string{"email": email, "password": password}, "", "")
	assertStatus("old password after reset", response, http.StatusUnauthorized)

	response = request(http.MethodPost, "/api/auth/login", map[string]string{"email": email, "password": newPassword}, "", "")
	assertStatus("sign-in after password reset", response, http.StatusOK)
	if err := json.Unmarshal(response.Body.Bytes(), &session); err != nil || session.CSRFToken == "" {
		t.Fatal("new sign-in response did not include a CSRF token")
	}
	cookies = responseCookies(response)
	response = request(http.MethodGet, "/api/auth/me", nil, cookies, "")
	assertStatus("new authenticated session", response, http.StatusOK)
	response = request(http.MethodPost, "/api/auth/logout", nil, cookies, session.CSRFToken)
	assertStatus("logout", response, http.StatusNoContent)
	response = request(http.MethodGet, "/api/auth/me", nil, cookies, "")
	assertStatus("session after logout", response, http.StatusUnauthorized)
}

func validateLocalMailpitURL(rawURL string) error {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Scheme != "http" || parsed.Host == "" {
		return fmt.Errorf("TEST_MAILPIT_API_URL must be an HTTP URL")
	}
	host := parsed.Hostname()
	if host != "localhost" && net.ParseIP(host) == nil || net.ParseIP(host) != nil && !net.ParseIP(host).IsLoopback() {
		return fmt.Errorf("TEST_MAILPIT_API_URL must point to loopback")
	}
	return nil
}

func listMailpitMessages(client *http.Client, apiURL string) ([]mailpitMessageSummary, error) {
	request, err := http.NewRequest(http.MethodGet, strings.TrimRight(apiURL, "/")+"/messages?start=0&limit=200", nil)
	if err != nil {
		return nil, err
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Mailpit returned HTTP %d", response.StatusCode)
	}
	var result mailpitMessageList
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result.Messages, nil
}

func waitForMailpitToken(t *testing.T, client *http.Client, apiURL string, initialIDs map[string]struct{}, email, subjectPart string) (string, error) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		messages, err := listMailpitMessages(client, apiURL)
		if err != nil {
			return "", fmt.Errorf("read Mailpit inbox: %w", err)
		}
		for _, summary := range messages {
			if _, existed := initialIDs[summary.ID]; existed || !mailpitMessageTo(summary, email) || !strings.Contains(strings.ToLower(summary.Subject), subjectPart) {
				continue
			}
			message, err := readMailpitMessage(client, apiURL, summary.ID)
			if err != nil {
				return "", err
			}
			content := message.Text + "\n" + message.HTML
			token := regexp.MustCompile(`#token=([^&\s"'<>]+)`).FindStringSubmatch(content)
			if len(token) != 2 {
				return "", fmt.Errorf("Mailpit %s message did not contain a token link", subjectPart)
			}
			decoded, err := url.PathUnescape(token[1])
			if err != nil {
				return "", fmt.Errorf("decode Mailpit token link")
			}
			return decoded, nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	return "", fmt.Errorf("timed out waiting for Mailpit %s message", subjectPart)
}

func mailpitMessageTo(message mailpitMessageSummary, email string) bool {
	for _, recipient := range message.To {
		if strings.EqualFold(recipient.Address, email) {
			return true
		}
	}
	return false
}

func readMailpitMessage(client *http.Client, apiURL, id string) (mailpitMessage, error) {
	request, err := http.NewRequest(http.MethodGet, strings.TrimRight(apiURL, "/")+"/message/"+url.PathEscape(id), nil)
	if err != nil {
		return mailpitMessage{}, err
	}
	response, err := client.Do(request)
	if err != nil {
		return mailpitMessage{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return mailpitMessage{}, fmt.Errorf("read Mailpit message: HTTP %d", response.StatusCode)
	}
	var result mailpitMessage
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return mailpitMessage{}, err
	}
	return result, nil
}

func deleteMailpitMessages(client *http.Client, apiURL string, ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	body, err := json.Marshal(struct {
		IDs []string
	}{IDs: ids})
	if err != nil {
		return err
	}
	request, err := http.NewRequest(http.MethodDelete, strings.TrimRight(apiURL, "/")+"/messages", bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("delete temporary Mailpit messages: HTTP %d", response.StatusCode)
	}
	return nil
}

func responseCookies(response *httptest.ResponseRecorder) string {
	var cookies []string
	for _, cookie := range response.Result().Cookies() {
		cookies = append(cookies, cookie.Name+"="+cookie.Value)
	}
	return strings.Join(cookies, "; ")
}
