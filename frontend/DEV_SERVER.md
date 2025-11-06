# Running the Next.js server

These notes assume Windows PowerShell (the default shell in this workspace) and that dependencies are already installed via `npm ci`.

## 1. Install once (per clone)

```powershell
cd C:\Users\shahb\OneDrive\Desktop\Divan\frontend
npm ci
```

## 2. Start the development server

```powershell
cd C:\Users\shahb\OneDrive\Desktop\Divan\frontend
$env:NODE_OPTIONS=""
$env:NEXT_TELEMETRY_DISABLED="1"
npm run dev
```

- Next.js listens on port `3000` by default. If that port is busy, the CLI will automatically fall back to the next free port (for example `3001`) and print the URL.
- Leave the shell open while you work; the dev server rebuilds on every file change.
- Configure demo links by copying `.env.example` to `.env.local` and populating any `NEXT_PUBLIC_DEMO_*` variables (handles, chat peer IDs, activity IDs). Restart the server after changes so the new values propagate.
- The backend seed data uses campus `33333333-3333-3333-3333-333333333333`; keep `NEXT_PUBLIC_DEMO_CAMPUS_ID` aligned so chat requests send the correct header.
- API proxying (development): the dev server rewrites the following paths to the backend at `http://localhost:8000` to avoid CORS and HTML responses:
  - `/auth/*`, `/profile/*`, `/privacy/*`
  - `/chat/conversations/*`, `/chat/messages`
  - The `/chat` pages themselves continue to be served by Next.js.
  - You can disable client-side usage of the proxy by setting `NEXT_PUBLIC_DEV_API_PROXY=0` in `.env.local` (the default is enabled in development).

## 3. Run the Playwright smoke test

```powershell
cd C:\Users\shahb\OneDrive\Desktop\Divan\frontend
npm run test:e2e -- communities
```

- The command runs the `e2e/communities.spec.ts` check against a stubbed API.
- Playwright will start a dev server automatically; ensure no other process occupies the chosen port.

## 4. Troubleshooting

- **Port already in use**: run `Get-NetTCPConnection -State Listen -LocalPort 3000` to see which process occupies the port. Stop that process or allow Next.js to pick the fallback port it suggests.
- **Stale environment variables**: if the terminal has old values for `NODE_OPTIONS`, reset them with `$env:NODE_OPTIONS=""` before starting the server.
- **Production build** (optional check):

  ```powershell
  cd C:\Users\shahb\OneDrive\Desktop\Divan\frontend
  npm run build
  ```

  This generates the optimized bundle used by `npx next start`.

## 5. Stop the server

Press `Ctrl+C` in the terminal running `npm run dev` when you are done.
