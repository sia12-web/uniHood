-- delete_demo_users.sql
-- SAFE workflow: review the SELECT output first, then remove dependent rows, then delete users.
-- Adjust or remove statements as needed for your schema (some apps have additional tables: messages, activities, presence, profiles, avatars, etc.).

-- Demo IDs (replace if different):
-- Users:
--   bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
--   cccccccc-cccc-cccc-cccc-cccccccccccc
-- Seeded demo users (from scripts/seed_demo_users.py):
--   email ends with @example.com (and/or campus_id = 33333333-3333-3333-3333-333333333333)
-- Campus (optional):
--   c4f7d1ec-7b01-4f7b-a1cb-4ef0a1d57ae2
--   aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa

-- NOTE:
-- Prefer soft-delete (set deleted_at) to avoid foreign-key issues.
-- If you truly want hard deletes, adapt dependent table deletes for your schema.

BEGIN;

-- 1) Verify the users exist (run this and inspect results before making changes)
SELECT id, email, handle, campus_id FROM users WHERE id IN (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
);

-- 1b) Verify seeded demo users (generated via scripts/seed_demo_users.py)
SELECT COUNT(*) AS seeded_demo_users
FROM users
WHERE email ILIKE '%@example.com'
   OR campus_id = '33333333-3333-3333-3333-333333333333';

-- 1c) Verify "Test User" demo accounts (often created during manual testing)
SELECT COUNT(*) AS test_user_accounts
FROM users
WHERE display_name ILIKE 'Test User%';

-- If the SELECT above returns the rows you expect, you can proceed.
-- If you want to continue within this transaction, remove the ROLLBACK below and run COMMIT at the end.
-- ROLLBACK; -- uncomment this line to stop after verification (recommended for a dry-run)

-- 2) Soft-delete demo users so they no longer show up in the app.
-- This avoids FK constraint failures while removing them from normal queries.
UPDATE users
SET deleted_at = NOW()
WHERE deleted_at IS NULL
  AND (
    id IN (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'cccccccc-cccc-cccc-cccc-cccccccccccc'
    )
    OR email ILIKE '%@example.com'
    OR campus_id = '33333333-3333-3333-3333-333333333333'
    OR display_name ILIKE 'Test User%'
  );

-- Optional: also revoke sessions for these demo users (recommended).
-- Note: keep this optional because some deployments may not have a sessions table.
-- DELETE FROM sessions WHERE user_id IN (
--   SELECT id FROM users WHERE deleted_at IS NOT NULL AND (email ILIKE '%@example.com' OR campus_id = '33333333-3333-3333-3333-333333333333')
-- );

-- 4) Optional: delete the demo campus (ONLY IF NO REAL USERS ARE TIED TO IT)
-- WARNING: only run this if you're certain no production users reference this campus.
-- DELETE FROM campuses WHERE id = 'c4f7d1ec-7b01-4f7b-a1cb-4ef0a1d57ae2';
-- Optional: delete additional demo campus that appears in some seeds/envs
-- DELETE FROM campuses WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

COMMIT;

-- Helpful queries for diagnosing FKs referencing users:
-- (run separately if you see FK constraint errors to find dependent tables)
--
-- SELECT
--   tc.table_name AS referencing_table,
--   kcu.column_name AS referencing_column,
--   ccu.table_name AS referenced_table,
--   ccu.column_name AS referenced_column
-- FROM information_schema.table_constraints AS tc
-- JOIN information_schema.key_column_usage AS kcu
--   ON tc.constraint_name = kcu.constraint_name
-- JOIN information_schema.constraint_column_usage AS ccu
--   ON ccu.constraint_name = tc.constraint_name
-- WHERE tc.constraint_type = 'FOREIGN KEY'
--   AND ccu.table_name = 'users';

-- Backup example (run before making deletions):
-- pg_dump -h <host> -p <port> -U <user> -d <database> -F c -f demo_users_backup.dump

-- End of script
