# Moderation · Backend Phase 4 — Safety Filters & Content Scanning

## 0. Goals / Non-Goals
- **Goals**: asynchronous scanning for text, media and URLs; quarantine queue; perceptual hashing; OCR hand-off; URL reputation; configurable thresholds; enrichment of existing policy signals.
- **Non-Goals**: training or shipping custom ML models; only pluggable adapters and stubs are required for dev.

## 1. Data Model (PostgreSQL 16)
```sql
-- Media attachments gain safety metadata used by moderation workers
ALTER TABLE media_attachment
  ADD COLUMN safety_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN safety_score JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN scanned_at TIMESTAMPTZ NULL;

CREATE TABLE mod_text_scan (
  id BIGSERIAL PRIMARY KEY,
  subject_type TEXT NOT NULL,
  subject_id UUID NOT NULL,
  lang TEXT NULL,
  scores JSONB NOT NULL,
  ocr BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(subject_type, subject_id)
);

CREATE TABLE mod_url_scan (
  id BIGSERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  eTLD_plus_one TEXT NULL,
  final_url TEXT NULL,
  verdict TEXT NOT NULL,
  details JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON mod_url_scan (final_url);
CREATE INDEX ON mod_url_scan (eTLD_plus_one);

CREATE TABLE mod_media_hash (
  id BIGSERIAL PRIMARY KEY,
  algo TEXT NOT NULL,
  hash TEXT NOT NULL,
  label TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(algo, hash)
);
```

## 2. Queues (Redis Streams)
- `scan:ingress` — feed of scan jobs (`type=image|file|text|url`).
- `scan:results` — normalized scan outcomes for the policy / enforcement pipeline.
- `scan:quarantine` — attachments awaiting human review; workers publish after escalation.

Example payload:
```json
{"event_id":"uuid","subject_type":"post","subject_id":"...","type":"image","s3_key":"...","mime":"image/jpeg","group_id":"..."}
```

## 3. Integration Points
1. **Uploads**: presign sets `safety_status=pending`. On finalize enqueue media job. High-risk MIME types may be marked `needs_review` immediately. Synchronous head check for strict surfaces (avatars, covers).
2. **Post / Comment create**: text payload enqueued for scanning. Hard block (`400 content_blocked`) when high-confidence hate/self-harm.
3. **Links**: server extracts URLs, enqueues URL jobs, reuses cached verdicts.

## 4. Scanners (Workers)
- **Image/File**: download via signed URL, compute perceptual hash, lookup `mod_media_hash`, run NSFW/gore, OCR text hand-off, update attachment safety fields, publish results, route to quarantine on high scores.
- **Text**: normalize text + OCR hand-off, score toxicity/harassment/hate, upsert `mod_text_scan`, emit results with suggested actions based on thresholds.
- **URL**: resolve redirects (≤5 hops), compute eTLD+1, check deny/allow lists, classify verdict (`clean|suspicious|malicious|unknown`), cache rows for 24h TTL.

## 5. Policy Mapping
Default thresholds (configurable in `config/moderation.yml`):
```yaml
text:
  hard_block:
    hate: 0.98
    selfharm: 0.98
  soft_enforce:
    toxicity: 0.92
    harassment: 0.92
image:
  hard_block:
    nsfw: 0.97
    gore: 0.80
  soft_review:
    nsfw: 0.85
url:
  malicious: tombstone
  suspicious: warn
```
Hard blocks remove content immediately. Soft review pushes to quarantine / tombstone post publish.

## 6. Quarantine Workflow
- Statuses: `pending` → `needs_review` → `quarantined` → `clean|blocked`.
- Staff API:
  - `GET /api/mod/v1/quarantine?status=needs_review|quarantined&after&limit`
  - `POST /api/mod/v1/quarantine/{attachment_id}/decision {verdict, note?}`
- Decisions: `clean` (restore), `blocked` (delete + case), `tombstone` (hide, audit).

## 7. Scanner Skeletons
Illustrative pseudocode for workers is included in the project source (`app/moderation/workers/*.py`).

## 8. Results → Policy
`results_worker` consumes `scan:results`, materializes `mod_case` entries via `ModerationEnforcer`, and emits downstream decisions. Suggested actions are respected; otherwise policy thresholds determine severity.

## 9. Config & Tuning
- Global and per-surface thresholds defined in `config/moderation.yml`.
- Borderline sampling adds `needs_review` entries to staff queue.
- OCR failures or missing models fall back to `unknown` verdicts.

## 10. Observability
Prometheus metrics: `scan_jobs_total{type,status}`, `scan_failures_total{type,reason}`, `scan_latency_seconds{type}`, `quarantine_backlog_gauge{status}`, `url_verdict_total{verdict}`, `nsfw_score_histogram`.

## 11. Security & Privacy
- Signed URLs (≤60s) for fetches.
- OCR text trimmed to 5k chars, not persisted beyond safety score payload.
- Hash lists append-only, admin audited.
- Timeouts: 5s image head, 3s OCR, 2s URL head.

## 12. Failure Modes
- Model unavailable → return `unknown`, retry with jitter.
- OCR failure → warning only.
- Robots / blocked redirects → `unknown` verdict.

## 13. Deliverables
- Workers: `image_scanner.py`, `text_scanner.py`, `url_scanner.py`, `results_worker.py`, `quarantine_manager.py`.
- API: quarantine listing/decisions, hash import.
- Data: migrations + config + seeds (provided as stubs).
- Tests: see `test_plan.md`.
