package main

import "time"

// nextRecurringDate advances from the previous occurrence while retaining the
// original day and month for dates that do not exist in every calendar period.
func nextRecurringDate(previous, anchor time.Time, frequency string) time.Time {
	if frequency == "weekly" {
		return previous.AddDate(0, 0, 7)
	}
	year, month := previous.Year(), previous.Month()
	if frequency == "monthly" {
		month++
		if month > time.December {
			month = time.January
			year++
		}
	} else if frequency == "yearly" {
		year++
		month = anchor.Month()
	} else {
		return previous
	}
	lastDay := time.Date(year, month+1, 0, 0, 0, 0, 0, previous.Location()).Day()
	day := anchor.Day()
	if day > lastDay {
		day = lastDay
	}
	return time.Date(year, month, day, 0, 0, 0, 0, previous.Location())
}
