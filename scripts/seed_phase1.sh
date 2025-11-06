#!/bin/bash
set -euo pipefail

ROOT_DIR="$(dirname "$0")/.."
cd "$ROOT_DIR"

DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/divan}"

psql "$DATABASE_URL" -f infra/migrations/0001_init.sql

psql "$DATABASE_URL" <<'SQL'
INSERT INTO campuses (id, name, lat, lon)
VALUES
	('33333333-3333-3333-3333-333333333333', 'Main Campus', 37.7749, -122.4194)
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, handle, display_name, avatar_url, campus_id, privacy)
VALUES
	('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'alice', 'Alice Example', NULL, '33333333-3333-3333-3333-333333333333', '{"visibility":"everyone","blur_distance_m":10}'),
	('cccccccc-cccc-cccc-cccc-cccccccccccc', 'bob', 'Bob Example', NULL, '33333333-3333-3333-3333-333333333333', '{"visibility":"friends","blur_distance_m":20}'),
	('dddddddd-dddd-dddd-dddd-dddddddddddd', 'carol', 'Carol Example', NULL, '33333333-3333-3333-3333-333333333333', '{"visibility":"none"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO friendships (user_id, friend_id, status)
VALUES
	('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'accepted'),
	('cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'accepted'),
	('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'blocked')
ON CONFLICT (user_id, friend_id) DO UPDATE SET status = EXCLUDED.status;
SQL
