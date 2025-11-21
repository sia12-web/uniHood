-- delete_demo_users.sql
-- SAFE workflow: review the SELECT output first, then remove dependent rows, then delete users.
-- Adjust or remove statements as needed for your schema (some apps have additional tables: messages, activities, presence, profiles, avatars, etc.).

-- Demo IDs (replace if different):
-- Users:
--   bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
--   cccccccc-cccc-cccc-cccc-cccccccccccc
-- Campus (optional):
--   c4f7d1ec-7b01-4f7b-a1cb-4ef0a1d57ae2
--   aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa

BEGIN;

-- 1) Verify the users exist (run this and inspect results before making changes)
SELECT id, email, handle, campus_id FROM users WHERE id IN (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
);

-- If the SELECT above returns the rows you expect, you can proceed.
-- If you want to continue within this transaction, remove the ROLLBACK below and run COMMIT at the end.
-- ROLLBACK; -- uncomment this line to stop after verification (recommended for a dry-run)

-- 2) Delete dependent rows that reference these users. Add or remove tables depending on your schema.
-- Example dependent deletions (run in this order to avoid FK errors):

DELETE FROM sessions WHERE user_id IN (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
);

DELETE FROM friendships WHERE user_id IN (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
) OR friend_id IN (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
);

-- Optional: messages, deliveries, activities, presence, profiles, gallery, uploads, etc.
-- Uncomment or adapt depending on what tables your schema has.
-- DELETE FROM messages WHERE sender_id IN (... ) OR recipient_id IN (... );
-- DELETE FROM deliveries WHERE user_id IN (... );
-- DELETE FROM activities WHERE actor_id IN (... ) OR user_id IN (... );
-- DELETE FROM presence WHERE user_id IN (... );
-- DELETE FROM user_profiles WHERE user_id IN (... );
-- DELETE FROM avatars WHERE user_id IN (... );

-- 3) Delete the demo users
DELETE FROM users WHERE id IN (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
);

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
