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
npm run dev
# or
pnpm dev
```

- Next.js listens on port `3000` by default.
- The server rebuilds on every file change.
- Configure environment variables in `.env.local` (copy from `.env.example`).

### Go Live Feature (Optional)

To enable the "Go Live" proximity feature locally:

1.  Add `NEXT_PUBLIC_ENABLE_GO_LIVE=true` to `.env.local`.
2.  Restart the dev server.
3.  Open `http://localhost:3000/` and use the "People nearby" card.

### Component Harnesses

- **GoLiveStrip Sandbox**: `http://localhost:3000/_harness/proximity/golive`
  - Test the UI states without network calls.

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

## 4. Troubleshooting

- **Port in use**: If port 3000 is busy, Next.js will try 3001. Check your terminal output.
- **Hydration Errors**: Ensure your server and client render the same content. Common causes are random values (use `useEffect` to set them on client) or invalid HTML nesting.

## 5. Production Build

To test the production build locally:

```bash
npm run build
npm start
```
