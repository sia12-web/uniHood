# Contributing to Divan

We're excited to have you join us! This guide will help you get started with contributing to Divan.

## Code of Conduct

Please be respectful and considerate of others. We strive to maintain a welcoming and inclusive environment for everyone.

## Getting Started

1.  **Fork and Clone**: Fork the repository and clone it to your local machine.
2.  **Environment Setup**: Follow the [README.md](./README.md) to set up your local development environment (Docker, Node.js, Python).
3.  **Dependencies**:
    *   **Root**: This is a pnpm workspace. Run `pnpm install` in the root to install dependencies for all packages (if using pnpm).
    *   **Frontend**: `cd frontend && npm install` (or `pnpm install`)
    *   **Backend**: Managed via Poetry inside Docker, or `poetry install` locally.
    *   **Activities**: `cd services/activities-core && npm install` (or `pnpm install`)

## Development Workflow

1.  **Branching**: Create a new branch for your feature or fix.
    *   Format: `feature/your-feature-name` or `fix/issue-description`
2.  **Commits**: Write clear and concise commit messages.
    *   Example: `feat(auth): implement login flow` or `fix(ui): resolve hydration error on profile page`
3.  **Linting & Formatting**:
    *   Frontend: `npm run lint`
    *   Backend: Ensure code follows PEP 8.

## Testing

Before submitting a PR, ensure all tests pass.

*   **Frontend**:
    *   Unit Tests: `npm test`
    *   E2E Tests: `npm run test:e2e`
*   **Backend**:
    *   Run `pytest` inside the backend container or locally.

## Pull Request Process

1.  Push your branch to your fork.
2.  Open a Pull Request (PR) against the `main` branch.
3.  Provide a clear description of your changes and link to any relevant issues.
4.  Wait for CI checks to pass and for a review from a maintainer.

## Project Structure

*   `frontend/`: Next.js web application.
*   `backend/`: FastAPI backend service.
*   `services/`: Microservices (e.g., `activities-core`).
*   `infra/`: Infrastructure configuration (Docker, Migrations).
*   `scripts/`: Utility scripts for seeding data, migrations, etc.

Thank you for contributing!
