# Pagination & Cursors (Keyset)

## Cursor format
- Opaque base64 of `{ "t": "<iso8601>", "id": "<uuid>" }`.
- Order: `created_at DESC, id DESC`.

## Request
- `GET ...?limit=50&cursor=<opaque>` (limit 1..100)

## Response
- `{ "items": [ ... ], "next": "<opaque|null>" }`
- `next` is null when no more pages.

## Algorithm
1. If cursor present, decode → (`t`,`id`).
2. WHERE `(created_at, id) < (t, id)` in DESC order.
3. ORDER BY `created_at DESC, id DESC` LIMIT :limit+1
4. If row count == limit+1, compute next from last row (drop the extra).
