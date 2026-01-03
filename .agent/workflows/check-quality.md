---
description: Run full quality checks (Linting, Types, Tests) across Frontend and Backend
---

## Frontend Checks

1. Change to frontend directory
// turbo
2. CD to frontend
   ```bash
   cd frontend
   ```

3. Run Linting
// turbo
4. Run ESLint
   ```bash
   npm run lint
   ```

5. Run Type Checking
// turbo
6. Run TSC
   ```bash
   npm run typecheck
   ```

## Backend Checks

7. Change to backend directory
// turbo
8. CD to backend
   ```bash
   cd ../backend
   ```

9. Run Linting (CRITICAL)
// turbo
10. Run Ruff (or flake8) to catch missing imports/syntax errors
    ```bash
    # If using poetry:
    poetry run ruff check .
    # Or if installed globally:
    ruff check .
    ```

11. Run Tests
// turbo
12. Run Pytest
    ```bash
    poetry run pytest
    ```
