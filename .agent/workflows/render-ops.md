---
description: How to interact with Render API and manage services
---
// turbo-all

The application is hosted on Render.com. Use the Render API to monitor and manage services.

## Authentication
Use the Render API Key: `rnd_V5JgKshNq2p4ajDL5gYd525c8mFn`.
When using `curl.exe`, use the header: `-H "Authorization: Bearer rnd_V5JgKshNq2p4ajDL5gYd525c8mFn"`.

## Service IDs
- **Backend (API)**: `srv-d51m24euk2gs739vaf20`
- **Frontend (Web)**: `srv-d51mjleuk2gs739vl9gg`
- **Activities Core**: `srv-d51mbtumcj7s73efcgi0`

## Common Operations

### 1. List All Services Status
```powershell
curl.exe -s -X GET https://api.render.com/v1/services -H "Authorization: Bearer rnd_V5JgKshNq2p4ajDL5gYd525c8mFn"
```

### 2. Check Latest Deploy Status
To verify if a deployment is successful:
```powershell
curl.exe -s -X GET "https://api.render.com/v1/services/<SERVICE_ID>/deploys?limit=1" -H "Authorization: Bearer rnd_V5JgKshNq2p4ajDL5gYd525c8mFn"
```
Look for `"status": "live"`.

### 3. View Service Events (Build/Deploy logs)
```powershell
curl.exe -s -X GET "https://api.render.com/v1/services/<SERVICE_ID>/events?limit=5" -H "Authorization: Bearer rnd_V5JgKshNq2p4ajDL5gYd525c8mFn"
```

### 4. Trigger Manual Deploy (with Cache Clear)
```powershell
# Using powershell to send JSON safely
$body = '{"clearCache": "clear"}'
curl.exe -X POST "https://api.render.com/v1/services/<SERVICE_ID>/deploys" -H "Authorization: Bearer rnd_V5JgKshNq2p4ajDL5gYd525c8mFn" -H "Content-Type: application/json" -d $body
```

## Critical Configuration Notes
- **Docker Build Context**:
  - **Backend**: Set `Docker Context: backend` and `DockerfilePath: backend/Dockerfile`.
  - **Note**: Render expects the `DockerfilePath` to be relative to the **Repo Root**, while `Docker Context` determines the files copied into the build.
- **Pre-deploy Command**: Use `python scripts/ensure_migrations.py` (relative to the context).
- **Port**: Render sets a `PORT` environment variable. The app MUST listen on this port.
- **Environment**: All secrets are managed in the Render Dashboard environment variables.
