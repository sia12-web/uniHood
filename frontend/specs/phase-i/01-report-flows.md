# I1 — Report Flows (users can report content anywhere)

## Reportable Kinds
- "profile"
- "message"
- "room_message"
- "post"
- "comment"
- "image"

## Reasons (checkbox group)
- spam
- harassment
- hate
- nudity
- self-harm
- misinfo
- illegal
- other

## Required Fields
- kind
- targetId
- reasons[]
- freeText (<= 500)
- evidenceUrls[] (optional)

## useReport Hook
- function open({kind, targetId, prefilledReason?})
- Dialog shows reasons + optional text.
- On submit → POST /moderation/report with payload:
  { kind, target_id, reasons, note, evidence: [] }
- Idempotency: compute X-Idempotency-Key = sha256(kind|targetId|reasons|note).slice(0,32)
- Success → toast "Thanks, we’re on it" + emit clientMetrics('report.submit', {kind,reasons,count})

## ReportButton
- Small icon button with tooltip "Report"
- Accessibility: role="button", aria-label by kind
- Place in: Profile header, ChatMessage action menu, RoomMessage menu, Post/Comment kebab.

## Failure Handling
- 409 idempotency_conflict → treat as success
- 429 → toast "Too many reports. Try later."
- All others → toast error with Request-Id
