---
description: Promote changes from Development (dev-01) to Production (main)
---

1. Ensure we have the latest dev changes locally
// turbo
2. Checkout dev-01 and pull
   ```bash
   git checkout dev-01
   git pull origin dev-01
   ```

3. Switch to main branch
// turbo
4. Checkout main and pull
   ```bash
   git checkout main
   git pull origin main
   ```

5. Merge Development into Production
// turbo
6. Merge dev-01 into main
   ```bash
   git merge dev-01
   ```

7. Push Production
// turbo
8. Push to origin main
   ```bash
   git push origin main
   ```

9. Return to development branch
// turbo
10. Checkout dev-01
    ```bash
    git checkout dev-01
    ```

11. Verify Production Deployment (Render)
    Use `/render-ops` to verify that the services correctly started on Render.
    Basically, check `srv-d51m24euk2gs739vaf20` (backend) and `srv-d51mjleuk2gs739vl9gg` (frontend) deploy logs.
