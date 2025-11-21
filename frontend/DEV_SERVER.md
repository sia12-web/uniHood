# Running the Next.js server

These notes assume Windows PowerShell (the default shell in this workspace) and that dependencies are already installed via `pnpm install`.

## 1. Install once (per clone)

```powershell
cd C:\Users\shahb\OneDrive\Desktop\Divan\frontend
pnpm install
```

## 2. Start the development server

```powershell
cd C:\Users\shahb\OneDrive\Desktop\Divan\frontend
$env:NODE_OPTIONS=""
$env:NEXT_TELEMETRY_DISABLED="1"
pnpm dev
```

- Next.js listens on port `3000` by default. If that port is busy, the CLI will automatically fall back to the next free port (for example `3001`) and print the URL.
- Leave the shell open while you work; the dev server rebuilds on every file change.
- Configure demo links by copying `.env.example` to `.env.local` and populating any `NEXT_PUBLIC_DEMO_*` variables (handles, chat peer IDs, activity IDs). Restart the server after changes so the new values propagate.

### Go Live quickstart (optional)

- Enable the feature flag (persisted across sessions):

  ```powershell
  setx NEXT_PUBLIC_ENABLE_GO_LIVE "true"
  ```

  Restart your terminal/editor so the new env var is visible to `npm run dev`, or put it in `frontend/.env.local`:

  ```env
  NEXT_PUBLIC_ENABLE_GO_LIVE=true
  ```

- Open http://localhost:3000/ and use the People nearby card’s **Go live now** control. In demo mode (logged out or demo campus), a fallback location is used; when you grant location permission, the browser’s position is used instead.
- Heartbeats run every few seconds; a successful heartbeat stores a timestamp in `localStorage`.
- The homepage shows a subtle badge next to "People nearby":
  - "Go Live available" when the flag is on
  - "Live now" if a recent heartbeat (≈90s window) exists; the badge updates roughly every 15s

### Component harnesses

- GoLiveStrip sandbox (no network calls):

  http://localhost:3000/_harness/proximity/golive

  Use the controls to toggle enabled state, heartbeat seconds, radius, accuracy, and the presence status banner.

## 3. Run the Playwright smoke test

```powershell
cd C:\Users\shahb\OneDrive\Desktop\Divan\frontend
pnpm test:e2e -- communities
```

- The command runs the `e2e/communities.spec.ts` check against a stubbed API.
- Playwright will start a dev server automatically; ensure no other process occupies the chosen port.

## 4. Troubleshooting

- **Port already in use**: run `Get-NetTCPConnection -State Listen -LocalPort 3000` to see which process occupies the port. Stop that process or allow Next.js to pick the fallback port it suggests.
- **Stale environment variables**: if the terminal has old values for `NODE_OPTIONS`, reset them with `$env:NODE_OPTIONS=""` before starting the server.
- **Production build** (optional check):

  ```powershell
  cd C:\Users\shahb\OneDrive\Desktop\Divan\frontend
  pnpm build
  ```

  This generates the optimized bundle used by `npx next start`.

## 5. Stop the server

Press `Ctrl+C` in the terminal running `npm run dev` when you are done.
