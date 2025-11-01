# Phase G - Moderation Safety Scanning

## Highlights
- Delivered asynchronous safety pipeline with Redis-backed workers (`backend/app/moderation/workers/*.py`) to scan text, media, and URLs, publish normalized results, and manage quarantine decisions via the new results worker and manager loops.
- Extended the moderation domain container and configuration (`backend/app/moderation/domain/container.py`, `backend/app/moderation/settings.py`, `backend/config/moderation.yml`) to load threshold policies, expose the safety repository, and register Prometheus metrics for job counts, failures, latency, backlog, URL verdicts, and NSFW score histograms.
- Added FastAPI admin surfaces for safety review (`backend/app/moderation/api/quarantine.py`, `backend/app/moderation/api/hashes_admin.py`) so staff can triage quarantined attachments and manage perceptual hash imports.
- Introduced Postgres migrations `infra/migrations/0230_attachment_safety_fields.sql` through `infra/migrations/0233_media_hash.sql` to persist scan scores, attachment safety state, URL verdict cache, and hash corpus entries that drive enforcement.
- Documented the phase with spec, test plan, and supportive docs under `parts/04-moderation/backend/phase-4-safety-scanning/` to guide future contributors and deployment owners.

## Testing
- `C:/Users/shahb/anaconda3/Scripts/conda.exe run -p C:\Users\shahb\anaconda3 --no-capture-output python -m pytest backend/tests/unit/test_moderation_thresholds.py`

## Operations
- Apply safety migrations: `0230_attachment_safety_fields.sql`, `0231_text_scan.sql`, `0232_url_scan.sql`, `0233_media_hash.sql`.
- Ensure Prometheus scrapes include the new `scan_*` and `quarantine_backlog_gauge` metrics family for observability.

## Follow-ups
- Swap stubbed NSFW/OCR/URL reputation adapters for production integrations and update configuration secrets accordingly.
- Expand integration coverage for worker pipelines, quarantine decisions, and enforcement hooks once external services are wired.
- Re-enable the aggregated migration runner once the media attachment table ships broadly, removing the temporary DO-block guard if desired.
