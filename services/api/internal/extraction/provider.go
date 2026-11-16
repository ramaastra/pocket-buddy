// Package extraction defines the future server-side extraction boundary.
// No provider or upload endpoint is enabled yet.
package extraction

import "context"

// Provider handles image bytes only for the duration of a call. Implementations
// must not retain or log them. Drafts must be reviewed before persistence.
type Provider interface {
	Extract(ctx context.Context, image []byte, mediaType string) ([]Draft, error)
}

// Draft is an unconfirmed suggestion. AmountMinor is an integer, never a float.
type Draft struct {
	Kind        string
	AmountMinor *int64
	Currency    string
	Date        string
	Merchant    string
	Note        string
}
