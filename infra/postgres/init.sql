-- PostgreSQL initialization script for production
-- This runs once when the database is first created

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Set timezone
SET timezone = 'UTC';

-- Create backup user with minimal permissions (for backup scripts)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'backup_user') THEN
        CREATE ROLE backup_user WITH LOGIN PASSWORD 'CHANGE_ME_IN_PRODUCTION';
    END IF;
END
$$;

-- Grant backup user read-only access
GRANT CONNECT ON DATABASE divan TO backup_user;
GRANT USAGE ON SCHEMA public TO backup_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO backup_user;

-- Performance settings hints (apply via postgresql.conf for persistence)
-- shared_buffers = 256MB (25% of RAM for small instances)
-- effective_cache_size = 768MB (75% of RAM)
-- maintenance_work_mem = 64MB
-- checkpoint_completion_target = 0.9
-- wal_buffers = 16MB
-- default_statistics_target = 100
-- random_page_cost = 1.1 (for SSD storage)
-- effective_io_concurrency = 200 (for SSD storage)
-- work_mem = 4MB
-- min_wal_size = 1GB
-- max_wal_size = 4GB
-- max_worker_processes = 4
-- max_parallel_workers_per_gather = 2
-- max_parallel_workers = 4
-- max_parallel_maintenance_workers = 2
