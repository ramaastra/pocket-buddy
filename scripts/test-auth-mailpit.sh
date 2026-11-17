#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

test_database="pocket_buddy_auth_mailpit_$$"
docker compose --env-file /dev/null exec -T db createdb -U pocket_buddy "$test_database"

cleanup() {
	docker compose --env-file /dev/null exec -T db dropdb -U pocket_buddy "$test_database" >/dev/null
}
trap cleanup EXIT

test_database_url="postgres://pocket_buddy:local_dev_only@127.0.0.1:5432/${test_database}?sslmode=disable"
(
	cd services/api
	GOCACHE="${GOCACHE:-/tmp/pocket-buddy-test-gocache}" \
	TEST_DATABASE_URL="$test_database_url" \
	TEST_MAILPIT=true \
	TEST_MAILPIT_API_URL=http://127.0.0.1:8025/api/v1 \
	TEST_MAILPIT_SMTP_PORT=1025 \
	go test -count=1 ./cmd/server -run '^TestAuthMailpitEndToEnd$'
)
