# Credential Policies (Algorithm)

## Passwords
- Length >= 12, deny list check (top 100k).
- Argon2id or bcrypt cost >= 12; pepper via env optional.

## Resets
1. Reset token: single-use, short TTL (15m).
2. Store hash of token; never store raw.
3. Invalidate all sessions on successful reset.

## Social/OAuth
- If OAuth only account: require email verification before messaging/rooms.
