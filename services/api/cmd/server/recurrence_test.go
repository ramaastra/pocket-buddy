package main

import (
	"testing"
	"time"
)

func TestNextRecurringDatePreservesAnchor(t *testing.T) {
	parse := func(value string) time.Time {
		date, err := time.Parse("2006-01-02", value)
		if err != nil {
			t.Fatal(err)
		}
		return date
	}
	for _, tc := range []struct{ previous, anchor, frequency, want string }{
		{"2025-01-31", "2025-01-31", "monthly", "2025-02-28"},
		{"2025-02-28", "2025-01-31", "monthly", "2025-03-31"},
		{"2024-02-29", "2024-02-29", "yearly", "2025-02-28"},
		{"2027-02-28", "2024-02-29", "yearly", "2028-02-29"},
		{"2025-12-29", "2025-12-29", "weekly", "2026-01-05"},
	} {
		got := nextRecurringDate(parse(tc.previous), parse(tc.anchor), tc.frequency).Format("2006-01-02")
		if got != tc.want {
			t.Errorf("%s from %s: got %s, want %s", tc.frequency, tc.previous, got, tc.want)
		}
	}
}
