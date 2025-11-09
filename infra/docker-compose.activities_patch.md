# Infra Patch for Activities Phase 2/3

- No new services required for QuickTrivia UI.
- Ensure `activities-core` service is rebuilt after backend changes.
- Add/verify seed scripts in container CMD or package.json scripts:
  - `prisma migrate deploy`
  - `node scripts/seed_speed_typing_texts.js`
  - `node scripts/seed_trivia_questions.js`
