package migrations

import "embed"

// Files contains the versioned SQL schema migrations used by the API at startup.
//
//go:embed *.sql
var Files embed.FS
