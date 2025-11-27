# Divan Backend – Phase 1: Proximity Core

This service provides real-time presence, proximity lookup, and social discovery for campus users.

- **Stack**: FastAPI, Redis GEO/Streams, Socket.IO (ASGI)
- **Features**:
    - Search & Discovery: `/search/users`, `/discover/people`, `/discover/rooms`
    - Observability: `/health/*`, `/metrics`
    - Moderation: `/api/mod/v1/*`
    - Safety Scanning: Redis Streams based scanners

## Idempotency Controls

- Critical write endpoints reserve keys in Postgres (`idempotency_keys`).
- Returns `201 Created` on first success, `200 OK` for safe replays.
- Configurable via `IDEMPOTENCY_REQUIRED` and `IDEMPOTENCY_TTL_SECONDS`.

## Local Development

### Running Tests

1.  **Unit & Integration Tests**:
    ```bash
    # Run all tests
    pytest -q

    # Run specific tests
    pytest tests/unit/test_moderation_detectors.py
    ```

2.  **Communities Integration Tests** (Requires Docker):
    ```bash
    pytest tests/integration/test_communities_repo.py
    ```

### Database Migrations

Migrations are applied automatically when the backend container starts. To apply manually:

```bash
# From project root
python scripts/apply_migrations.py
```

### Feature Toggles

Set these environment variables in `docker-compose.yml` or your local environment:

- `COMMUNITIES_WORKERS_ENABLED=true`: Launch communities outbox indexer.
- `MODERATION_WORKERS_ENABLED=true`: Spawn moderation ingress and actions workers.

### Scripts

- **Bootstrap Search**: `python -m scripts.search_bootstrap`
- **Verify User**: `python scripts/verify_account.py <email> <password>`
- **Delete User**: `python scripts/delete_account.py <email> <username>`
