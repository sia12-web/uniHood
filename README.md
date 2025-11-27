# Divan — Local Development Stack

This repository contains the full stack for Divan, including a Next.js frontend, FastAPI backend, and microservices, orchestrated with Docker Compose.

## Prerequisites

- **Docker Desktop**: Required for running the database (Postgres), Redis, and the Backend API.
- **Node.js (v20+)**: Required for Frontend and Activities service.
- **pnpm** (Recommended) or **npm**: Package manager.
- **Python (3.12+)**: Required if running backend locally outside Docker.

## Quick Start

1.  **Start Infrastructure & Backend**:
    ```powershell
    docker compose up -d
    ```
    This starts:
    - **Postgres**: `localhost:5432`
    - **Redis**: `localhost:6379`
    - **Backend API**: `http://localhost:8000` (Swagger UI: `/docs`)

    *Note: The backend container automatically applies database migrations on startup.*

2.  **Start Frontend**:
    ```bash
    cd frontend
    npm install
    npm run dev
    ```
    - App: `http://localhost:3000`

3.  **Start Activities Service** (Real-time features):
    ```bash
    cd services/activities-core
    npm install
    npm run dev
    ```
    - Service: `http://localhost:4005`

## Project Structure

- **`frontend/`**: Next.js 14 application (App Router).
- **`backend/`**: FastAPI application (Python). Handles auth, users, and core data.
- **`services/activities-core/`**: Node.js/Fastify microservice for real-time activities (e.g., Typing Duel).
- **`infra/`**:
    - **`migrations/`**: SQL migration files for Postgres.
    - **`docker/`**: Additional Docker configurations.
- **`scripts/`**: Utility scripts for data seeding, testing, and maintenance.

## Common Tasks

### Database Migrations
Migrations are applied automatically when the backend container starts. To apply them manually:
```bash
# From root
python scripts/apply_migrations.py
```

### Seeding Demo Data
To populate the database with test users and content:
```bash
# From root (requires python dependencies installed locally)
python scripts/seed_demo_data.py
```

### Running Tests
- **Frontend**: `cd frontend && npm test`
- **Backend**: `cd backend && pytest`
- **E2E**: `cd frontend && npm run test:e2e`

## Environment Setup

### Frontend (`frontend/.env.local`)
Copy `.env.example` to `.env.local`.
- `NEXT_PUBLIC_API_URL`: `http://localhost:8000`
- `NEXT_PUBLIC_ACTIVITIES_URL`: `http://localhost:4005`

### Backend (`backend/.env`)
Managed via `docker-compose.yml` environment variables.

## Troubleshooting

- **Database Connection Issues**: Ensure Docker is running and port 5432 is not occupied by another local Postgres instance.
- **Hydration Errors**: Ensure you are running the latest code. We recently fixed hydration issues on the Profile and Meetups pages.
- **Activities Service Error**: If you see "Table not found", run `npx prisma migrate dev` inside `services/activities-core`.

## Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.
