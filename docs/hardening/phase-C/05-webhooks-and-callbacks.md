# Webhooks

## Delivery
- POST with JSON; headers: `X-Divan-Event`, `X-Signature` (HMAC-SHA256).
- Retries with exponential backoff (max 24h).
- Events (future): message.created, invite.accepted, attachment.ready.

## Consumer contract
- Respond 2xx to ack; non-2xx → retry. (See <attachments> above for file contents. You may not need to search or read the file again.)
