-- Script to create a least-privilege application user
-- Run this as a superuser (postgres)

-- 1. Create the application user
CREATE USER divan_app WITH PASSWORD 'change_me_in_prod';

-- 2. Grant connection permissions
GRANT CONNECT ON DATABASE divan TO divan_app;

-- 3. Grant schema usage
GRANT USAGE ON SCHEMA public TO divan_app;

-- 4. Grant specific table permissions (CRUD only, no DDL)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO divan_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO divan_app;

-- 5. Ensure future tables also get these permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO divan_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO divan_app;

-- NOTE: Do NOT grant DROP, TRUNCATE, or ALTER permissions.
