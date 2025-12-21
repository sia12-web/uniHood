---
description: Deploy current changes to the Development environment (dev-01)
---

1. Check the current status of the repo
// turbo
2. Ensure we are on the `dev-01` branch
   ```bash
   git checkout dev-01
   ```

3. Stage all changes
// turbo
4. Commit changes (User should provide the message, default usage below)
   ```bash
   git add -A
   git commit -m "wip: Update dev-01"
   ```

5. Push to remote
// turbo
6. Push changes to origin
   ```bash
   git push origin dev-01
   ```
