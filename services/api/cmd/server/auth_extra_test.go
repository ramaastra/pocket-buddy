package main

import (
	"bufio"
	"fmt"
	"net"
	"strings"
	"testing"
)

func TestLocalAuthMailUsesFragmentAndRejectsExternalHost(t *testing.T) {
	t.Setenv("MAILPIT_HOST", "example.com")
	if err := sendLocalAuthMail("person@example.test", "verify", "test-secret", "http://localhost:3000"); err == nil {
		t.Fatal("external mail host accepted")
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Skipf("loopback listener unavailable: %v", err)
	}
	defer listener.Close()
	_, port, _ := net.SplitHostPort(listener.Addr().String())
	t.Setenv("MAILPIT_HOST", "127.0.0.1")
	t.Setenv("MAILPIT_PORT", port)
	messages := make(chan string, 1)
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			messages <- ""
			return
		}
		defer conn.Close()
		reader := bufio.NewReader(conn)
		fmt.Fprint(conn, "220 mailpit\r\n")
		var body strings.Builder
		inData := false
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				messages <- body.String()
				return
			}
			if inData {
				if line == ".\r\n" {
					inData = false
					fmt.Fprint(conn, "250 accepted\r\n")
				} else {
					body.WriteString(line)
				}
				continue
			}
			switch {
			case strings.HasPrefix(line, "EHLO"), strings.HasPrefix(line, "HELO"), strings.HasPrefix(line, "MAIL"), strings.HasPrefix(line, "RCPT"):
				fmt.Fprint(conn, "250 OK\r\n")
			case strings.HasPrefix(line, "DATA"):
				inData = true
				fmt.Fprint(conn, "354 send\r\n")
			case strings.HasPrefix(line, "QUIT"):
				fmt.Fprint(conn, "221 bye\r\n")
				messages <- body.String()
				return
			default:
				fmt.Fprint(conn, "500 unknown\r\n")
			}
		}
	}()
	if err := sendLocalAuthMail("person@example.test", "verify", "test-secret", "http://localhost:3000"); err != nil {
		t.Fatal(err)
	}
	body := <-messages
	if !strings.Contains(body, "http://localhost:3000/verify-email#token=test-secret") {
		t.Fatalf("verification link missing fragment: %q", body)
	}
	t.Setenv("MAILPIT_HOST", "example.com")
	if err := sendLocalAuthMail("person@example.test", "verify", "test-secret", "http://localhost:3000"); err == nil {
		t.Fatal("external mail host accepted")
	}
	if err := sendLocalAuthMail("person@example.test\r\nBcc: other@example.test", "verify", "test-secret", "http://localhost:3000"); err == nil {
		t.Fatal("invalid recipient accepted")
	}
}
