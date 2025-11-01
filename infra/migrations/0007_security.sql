-- Migration: Phase 2 security tables

-- Sessions table
create table if not exists sessions (
    id uuid primary key,
    user_id uuid not null references users(id) on delete cascade,
    created_at timestamptz not null default now(),
    last_used_at timestamptz not null default now(),
    ip inet,
    user_agent text,
    device_label text not null default '',
    revoked boolean not null default false
);
create index if not exists idx_sessions_user on sessions(user_id);

-- Two-factor auth secrets
create table if not exists twofa (
    user_id uuid primary key references users(id) on delete cascade,
    secret text not null,
    enabled boolean not null default false,
    created_at timestamptz not null default now(),
    last_verified_at timestamptz
);

-- Recovery codes for 2FA
create table if not exists recovery_codes (
    user_id uuid not null references users(id) on delete cascade,
    code_hash text not null,
    used_at timestamptz,
    created_at timestamptz not null default now(),
    primary key (user_id, code_hash)
);

-- Password reset tokens
create table if not exists password_resets (
    id uuid primary key,
    user_id uuid not null references users(id) on delete cascade,
    token text not null unique,
    expires_at timestamptz not null,
    used_at timestamptz,
    created_at timestamptz not null default now()
);
create index if not exists idx_pwres_user_open on password_resets(user_id) where used_at is null;
