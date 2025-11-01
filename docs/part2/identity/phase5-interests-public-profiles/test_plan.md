# Phase 5 — Identity & Profiles (Interests, Skills & Public Profiles) / test_plan.md

## Fixtures
- Users: u1 (owner), u2 (friend), u3 (public)
- Interests seeded: ml, ai, web-dev
- Redis running with clean state

## Unit — interests
- suggest returns prefix-first ordering; q len<2 => []
- add/remove interest; visibility patch works; rate limit enforced

## Unit — skills
- upsert validates slug + display + proficiency range; duplicate slug overwrites
- visibility patch; remove works

## Unit — links
- upsert validates kind and https URL; overwrite; remove

## Unit — education
- year bounds (1..10); visibility works

## Projection
- rebuild_public_profile writes public_profiles row and cache; avatar_url derived

## Visibility matrix
- owner sees all fields regardless of visibility
- friend sees 'friends'+'everyone'; public sees 'everyone' only

## Matching
- tags overlap ranks higher than skills alone
- excluding 'none' fields from candidates
- campus scoping enforced

## API
- GET /profiles/public/{handle} (public):
  - returns anonymized data for public viewer
- CRUD endpoints for interests/skills/links/education → 200 and persisted

## Security
- Auth required for all `/me` endpoints
- Blocked relationships respected when requesting another user’s public profile augmentation (future)

## Performance
- /profiles/public/{handle} served from Redis when cached (mock) → P95 < 50ms
- /interests/suggest P95 < 80ms (pg_trgm)
