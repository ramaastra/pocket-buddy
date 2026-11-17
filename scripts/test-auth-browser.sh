#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

test_email="pocket-buddy-browser-check-${RANDOM}-${RANDOM}@example.test"
docker compose --env-file /dev/null restart api >/dev/null

cleanup() {
	docker compose --env-file /dev/null exec -T db psql -U pocket_buddy -d pocket_buddy \
		-c "DELETE FROM public.users WHERE email = '$test_email';" >/dev/null
}
trap cleanup EXIT

TEST_EMAIL="$test_email" node scripts/test-auth-browser.mjs
