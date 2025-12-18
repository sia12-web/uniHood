# Running the Next.js Frontend

These notes assume you have `node` and `npm` (or `pnpm`) installed.

## 1. Install Dependencies

```bash
cd frontend
npm install
# or
pnpm install
```

## 2. Start the Development Server

```bash
npm run dev        # Turbopack (recommended)
# or
npm run dev:legacy # Webpack dev server
# or
npm run dev:clean   # Cold start (clears .next)
```

- Next.js listens on port `3000` by default.
- Turbopack dev server gives much faster cold + hot rebuilds. Use `dev:legacy` only if you hit unsupported features.
- Configure environment variables in `.env.local` (copy from `.env.example`).

### Go Live Feature (Optional)

To enable the "Go Live" proximity feature locally:

1.  Add `NEXT_PUBLIC_ENABLE_GO_LIVE=true` to `.env.local`.
2.  Restart the dev server.
3.  Open `http://localhost:3000/` and use the "People nearby" card.

### Component Harnesses

- **GoLiveStrip Sandbox**: `http://localhost:3000/_harness/proximity/golive`
  - Test the UI states without network calls.

## 2.1 Speeding up rebuilds

- Turbopack caches live under `.next/cache`. You can move them to a faster disk by setting `NEXT_CACHE_DIR` before running the dev server:

  ```powershell
  # PowerShell example (run once)
  $env:NEXT_CACHE_DIR = "C:\\dev\\divan-cache"
  npm run dev
  ```

- Playwright prep no longer nukes `.next` by default. If you do need a pristine build when running `npm run test:e2e`, opt in with `CLEAR_NEXT_BUILD=1 npm run test:e2e`.

## 3. Running Tests

### E2E Tests (Playwright)

```bash
npm run test:e2e
```

- Runs end-to-end tests against the application.
- Automatically starts a dev server if one isn't running (or uses the build).

### Unit Tests

```bash
npm test
```

Run static analysis explicitly when needed:

```bash
npm run lint
npm run typecheck
```

## 4. Troubleshooting

- **Port in use**: If port 3000 is busy, Next.js will try 3001. Check your terminal output.
- **Hydration Errors**: Ensure your server and client render the same content. Common causes are random values (use `useEffect` to set them on client) or invalid HTML nesting.

## 5. Production Build

To test the production build locally:

```bash
npm run build
npm start
```
