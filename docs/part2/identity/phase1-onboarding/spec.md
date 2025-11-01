# Phase 1 – Identity & Profiles (Onboarding + Verification)

Scope: verified campus identity, handle reservation, profile CRUD, avatar uploads (S3 presign), privacy settings, status, and campus binding. Hardened with rate limits and anti-abuse checks. Stack: FastAPI + PostgreSQL 16 + Redis + S3 + Next.js.

## 0) Directory (adds)
backend/
	app/
		api/auth.py
		api/profile.py
		domain/identity/
			__init__.py
			models.py          # users, campuses, email_verifications
			schemas.py
			service.py         # register, verify email, sign-in, handle reservation
			profile_service.py # profile CRUD, avatar presign, privacy
			policy.py          # rate limits, password rules, verification rules
			s3.py              # presign helpers
frontend/
	app/(identity)/
		onboarding/page.tsx
		verify/[token]/page.tsx
		settings/profile/page.tsx
	components/
		ProfileForm.tsx
		AvatarUploader.tsx
	lib/identity.ts

## 1) Data Model (PostgreSQL 16)

-- Campuses (seeded)
create table if not exists campuses (
	id uuid primary key,
	name text not null,
	domain text not null unique      -- email domain, e.g., "utoronto.ca"
);

-- Users
create table if not exists users (
	id uuid primary key,
	email text not null unique,
	email_verified boolean not null default false,
	handle text not null unique,                 -- @handle (lowercase, [a-z0-9_]{3,20})
	display_name text not null default '',
	bio text not null default '',
	avatar_key text,                             -- s3 key
	campus_id uuid references campuses(id),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	privacy jsonb not null default jsonb_build_object(
		'visibility','everyone',                   -- 'everyone'|'friends'|'none'
		'ghost_mode', false
	),
	status jsonb not null default jsonb_build_object(
		'text','', 'emoji','', 'updated_at', now()
	),
	password_hash text not null                  -- Argon2id
);

-- Email verification tokens (one active per user)
create table if not exists email_verifications (
	id uuid primary key,
	user_id uuid not null references users(id) on delete cascade,
	token text not null unique,                  -- 32-64b url-safe
	expires_at timestamptz not null,
	created_at timestamptz not null default now(),
	used_at timestamptz
);
create index if not exists idx_email_verif_user_open on email_verifications(user_id) where used_at is null;

-- Helpful indexes
create index if not exists idx_users_campus on users(campus_id);
create index if not exists idx_users_handle_trgm on users using gin (handle gin_trgm_ops);

## 2) Redis (rate limits + ephemeral state)

Keys:
- `rl:auth:register:{ip}:{yyyyMMddHH}` -> INCR/EX 3600 (≤ 20/hr)
- `rl:auth:verify:{email}:{minute}`    -> INCR/EX 60   (≤ 6/min)
- `rl:auth:login:{email}:{minute}`     -> INCR/EX 60   (≤ 12/min)
- `reserved:handle:{handle}`           -> SETEX 900 "<user_id>" (prevents race during onboarding)
- `ev:code:{user_id}`                  -> SETEX 900 "<6-digit code>" (optional code path)
- `otp:login:{user_id}` (reserved for future passwordless)

## 3) Authentication / Security

- Passwords: **Argon2id** (time+memory cost per env).  
- Email verification: either **link token** or **6-digit code** (we ship link token primarily; code optional).  
- JWT issuance after login: short-lived access (15m) + refresh (7d) (token impl is part of existing `infra/auth.py`).
- Handle rules:
	- lowercase, regex `^[a-z0-9_]{3,20}$`, not in **blocked list** (e.g., admin, support).
	- reserve handle in Redis during onboarding, finalize on success.

## 4) REST API (FastAPI)

POST   `/auth/register`              # email, password, handle, display_name, campus_id
POST   `/auth/login`                 # email + password → tokens
POST   `/auth/verify-email`          # body { token } → marks verified
POST   `/auth/resend`                # resend verification link
GET    `/auth/campuses`              # list campuses (id, name, domain)

GET    `/profile/me`
PATCH  `/profile/me`                 # display_name, bio, status, privacy, handle (change gated)
POST   `/profile/avatar/presign`     # { mime, bytes } → { key, url }
POST   `/profile/avatar/commit`      # attach uploaded key to profile

## 5) Schemas (Pydantic)

RegisterRequest:
{
	email: string, password: string, handle: string,
	display_name?: string, campus_id: UUID
}

LoginRequest: { email: string, password: string }

VerifyRequest: { token: string }

ProfileOut:
{
	id: UUID, email: string, email_verified: boolean,
	handle: string, display_name: string, bio: string,
	avatar_url?: string, campus_id?: UUID,
	privacy: { visibility: "everyone"|"friends"|"none", ghost_mode: boolean },
	status: { text: string, emoji: string, updated_at: string }
}

ProfilePatch:
{
	display_name?: string, bio?: string,
	privacy?: { visibility?: "everyone"|"friends"|"none", ghost_mode?: boolean },
	status?:  { text?: string, emoji?: string },
	handle?: string
}

PresignRequest: { mime: string, bytes: int }
PresignResponse: { key: string, url: string, expires_s: int }

## 6) Core Algorithms

### 6.1 Register


def register(email, password, handle, display_name, campus_id):
assert_rl("auth:register", ip, 20/hr)
email = norm_lower(email); handle = norm_lower(handle)
guard_email_domain(email, campus_id) # campus domain match
guard_handle_format(handle); guard_handle_blocklist(handle)

reserve handle to avoid race

if !SETNX_EX("reserved:handle:{handle}", user_uuid, 900s): raise ConflictHandle

create user

phash = argon2id_hash(password)
tx:
user_id = uuid4()
INSERT users(id,email,password_hash,handle,display_name,campus_id)
token = random_token(48)
INSERT email_verifications(user_id, token, expires_at=now()+24h)

send_verification_email(email, token) # out-of-band
return { user_id, email }


### 6.2 Verify Email


def verify_email(token):
row = SELECT * FROM email_verifications WHERE token=:token AND used_at IS NULL
if not row or row.expires_at < now(): raise Gone
tx:
UPDATE email_verifications SET used_at=now() WHERE id=row.id
UPDATE users SET email_verified=true WHERE id=row.user_id
return ok


### 6.3 Login


def login(email, password):
assert_rl("auth:login", email, 12/min)
u = SELECT * FROM users WHERE email=lower(email)
if not u or !argon2id_verify(password, u.password_hash): raise Unauthorized
tokens = issue_jwt_pair(u.id)
return tokens


### 6.4 Profile Get/Patch


GET /profile/me -> project ProfileOut with avatar_url via s3 public base + avatar_key

PATCH:
fields = validate(ProfilePatch)
if 'handle' in fields:
guard_handle_format + blocklist
ensure unique (no user with same handle)
tx:
UPDATE users SET fields..., updated_at=now()
return ProfileOut


### 6.5 Avatar Upload (Presign + Commit)


POST /profile/avatar/presign {mime,bytes}:
assert image mime in [image/jpeg,image/png,image/webp]
assert bytes <= 5MB
key = f"avatars/{user_id}/{ulid()}"
url = s3_presign_put(bucket,key,mime,expires=600)
return {key,url,expires_s=600}

POST /profile/avatar/commit { key }:
assert key prefix "avatars/{user_id}/"
UPDATE users SET avatar_key=:key
return ProfileOut


### 6.6 Privacy/Status
- `privacy.visibility`: governs search & discovery (Part 1 Phase 7).  
- `status`: text+emoji; truncate text ≤ 120 chars; emoji length ≤ 4.

## 7) Validation / Rules (policy.py)
- Email domain must match campus domain (e.g., `*@utoronto.ca`).
- Handle regex + uniqueness; reserved cache respected.
- Display name ≤ 80 chars; bio ≤ 500.
- Resend verify: limit ≤ 3/hour per email.
- On register, if email already exists and unverified:
	- regenerate token (upsert) + resend, **do not** leak user existence in response.

## 8) Observability Hooks
- `identity_register_total`, `identity_verify_total`, `identity_login_total`
- `identity_resend_total`, `profile_update_total`, `avatar_upload_total`
- Errors: `identity_rejects_total{reason}`

## 9) Frontend Flows

### Onboarding
- Form: email, password, handle, campus picker.
- POST `/auth/register` → success screen “Check your email”.
- Verification page `/onboarding` can accept `token` and call `/auth/verify-email`.

### Settings / Profile
- Load `/profile/me` → prefill form (display_name, bio, privacy, status).
- Avatar: presign → PUT to S3 → commit.
- Handle change: show inline validation + availability.

## 10) Constants
- PASSWORD_MIN_LEN = 8
- AVATAR_MAX_BYTES = 5 * 1024 * 1024
- VERIFY_TOKEN_TTL = 24 * 3600
- RESEND_PER_HOUR = 3
