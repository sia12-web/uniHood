# Test Plan — Moderation · Backend Phase 4 — Safety Filters & Content Scanning

## 0. Scope
Validate the end-to-end safety pipeline: scanning jobs, threshold routing, quarantine workflow, URL reputation cache, OCR → text hand-off, and enforcement hooks into the policy engine.

## 1. Unit
- **Perceptual hash**: identical images hash identically; small crops remain within Hamming distance ≤ 10.
- **Threshold routing**: scores around boundaries map to `clean`, `needs_review`, or `quarantined` based on config overrides.
- **URL classification**: phishing domains flag `malicious`; shortener + new domain → `suspicious`.
- **Text normalization**: strips markup, normalizes leetspeak/asterisks, lowercases.

## 2. Integration
- **Image scan**
  - Known-bad hash → `blocked`, moderation case emitted, action applied.
  - NSFW ≥ hard block → attachment `quarantined`, staff queue entry created.
  - NSFW between soft/hard → `needs_review`.
  - OCR text enqueued → `mod_text_scan` row appears.
- **Text scan**
  - Toxicity ≥ soft threshold → suggested `tombstone`, case created.
  - Hate/self-harm ≥ hard threshold → suggested `remove` decision.
- **URL scan**
  - Malicious verdict → tombstone action on parent post.
  - Cache hit (within 24h) bypasses HTTP lookup.
- **Results glue**
  - `scan:results` → enforcement idempotent on replays.

## 3. Quarantine Admin API
- `GET /api/mod/v1/quarantine` paginates, filters by status.
- `POST /api/mod/v1/quarantine/{id}/decision` transitions statuses, records audit payload.
- Audit row written per decision.

## 4. Performance
- Image scanner p95 < 250 ms (no OCR), OCR p95 < 700 ms.
- URL scanner p95 < 200 ms; cached hits < 5 ms.
- Pipeline sustains 100 img/s with 4 workers (load-test stub).

## 5. Resilience
- S3 5xx → retry with backoff; after 3 failures mark `unknown` + alert.
- Model timeout → failure metric, requeue with jitter, no queue stall.
- Redis restart → resume using last acknowledged stream ID.

## 6. Security
- Signed URLs limited to the object, expires ≤ 60s.
- Only admins can import perceptual hashes; import audited with counts.

## 7. End-to-End
1. Avatar upload with explicit content → synchronous pre-check blocks request (HTTP 400).
2. Borderline NSFW post → initially visible, later quarantined; author warned, others see tombstone.
3. Hate speech comment → synchronous block (400 content_blocked).
4. Post linking phishing URL → tombstoned; mod case opened; quarantine queue empty.

## 8. Coverage Targets
- ≥ 85% scanners/helpers.
- ≥ 80% results glue & APIs.
- ≥ 75% OCR + URL code paths.
