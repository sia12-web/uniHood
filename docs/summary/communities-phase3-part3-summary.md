## Communities — Phase 3 Part 3 Summary

Date: 2025-10-27

Phase 3 Part 3 completes the Communities events rollout with full RSVP lifecycle management, waitlist automation, observability, and worker plumbing. The work finalizes CRUD endpoints, transactional services, Redis fan-out, metrics, and targeted tests so events can be created, managed, and promoted across the Divan ecosystem.

### Goal

Deliver end-to-end support for events and RSVPs: creation, updates, capacity enforcement with automatic waitlisting, reminder scheduling, waitlist promotion, outbox/Redis emissions, and Prometheus metrics, while validating behaviour through focused unit tests.

### Key Deliverables

- Event service orchestration (`events_service.py`) covering creation, updates, ICS export, and reminder previews with authorization + capacity checks.
- RSVP service (`rsvp_service.py`) implementing transactional upserts, waitlist promotion, counter adjustments, admin moderation, deletions, and shared outbox/Redis emission helpers.
- REST routers for events and RSVPs wiring DTOs, auth policies, and service integrations (`app/communities/api/events.py`, `app/communities/api/rsvps.py`).
- Repository extensions for events/RSVP persistence: counter adjustments, waitlist listing, and waitlist candidate discovery (`app/communities/domain/repo.py`).
- Background workers for reminder scheduling and automatic waitlist promotion (`workers/reminders.py`, `workers/waitlist_promoter.py`).
- Redis stream publishers for event/RSVP notifications (`infra/redis_streams.py`) and Prometheus counters for creations, updates, and promotions (`app/obs/metrics.py`).
- Unit tests (`tests/unit/test_events_rsvps.py`) validating capacity/waitlist transitions plus refreshed identity tests to keep the suite green.

### Architecture Overview

- **Backend Services**
  - `RSVPService` centralises transactional logic, sharing helpers for outbox enqueueing, Redis emissions, and metrics bumps.
  - `EventsService` wraps repository operations with policy checks, generates ICS payloads, and seeds reminder previews.
  - DTOs updated to support admin-driven RSVP updates and exports.
- **Infra & Workers**
  - Redis stream helpers publish to `comm:event` / `comm:rsvp` channels for downstream consumers.
  - Reminder and waitlist promoter workers poll repositories, enforce schedules, and promote waitlisted users as capacity frees.
- **Observability**
  - Prometheus counters track events created, RSVP status updates, and waitlist promotions; metrics wired through service flows.

### Important Files

- backend/app/communities/domain/events_service.py — Event orchestration, ICS export, reminder preview.
- backend/app/communities/domain/rsvp_service.py — RSVP lifecycle, waitlist promotion, metrics/stream emission.
- backend/app/communities/domain/repo.py — Event + RSVP persistence helpers and counter adjustments.
- backend/app/communities/api/{events.py,rsvps.py,__init__.py} — REST wiring for events/RSVP endpoints.
- backend/app/communities/infra/redis_streams.py — Event/RSVP stream publishers.
- backend/app/communities/workers/{reminders.py,waitlist_promoter.py} — Background workers for reminders and waitlist automation.
- backend/app/obs/metrics.py — Prometheus counter registrations for events/RSVP flows.
- backend/tests/unit/test_events_rsvps.py — Waitlist + admin moderation test coverage.

### Tests & Status

- `pytest` (99 tests) passes locally using the configured conda environment after refreshing identity test doubles for async interfaces.
- `tests/unit/test_events_rsvps.py` specifically verifies capacity-driven waitlisting and admin decline promotions.

### Follow-Ups

1. Add SQL migrations for any remaining events/RSVP schema changes referenced by the services/workers.
2. Extend integration coverage to exercise Redis streams and worker promotion pipelines under concurrent scenarios.
3. Wire dashboards/alerts for the new Prometheus counters once deployed.
