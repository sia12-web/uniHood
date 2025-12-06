# Divan — Complete Project Documentation

> **Campus-centric social networking platform** for university students featuring real-time presence, social discovery, messaging, and mini-game activities.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Backend (FastAPI)](#4-backend-fastapi)
5. [Frontend (Next.js)](#5-frontend-nextjs)
6. [Services](#6-services)
7. [Infrastructure](#7-infrastructure)
8. [Database Schema](#8-database-schema)
9. [Scripts & Utilities](#9-scripts--utilities)
10. [Security Features](#10-security-features)
11. [Observability](#11-observability)
12. [Development Guide](#12-development-guide)
13. [API Reference](#13-api-reference)

---

## 1. Project Overview

### Purpose

**Divan** is a full-stack campus social networking platform designed for university students. It enables:

- **Campus Discovery** — Swipe-based matching with nearby students
- **Real-time Presence** — See who's nearby on campus
- **Social Features** — Friends, invites, blocking, profiles
- **Direct Messaging** — Private conversations
- **Group Rooms** — Shared chat spaces
- **Communities** — Campus groups with posts and discussions
- **Mini-Games** — Speed Typing Duel, Quick Trivia, Rock Paper Scissors, Tic-Tac-Toe, Story Builder
- **Meetups** — Campus event scheduling
- **Leaderboards** — Streaks, rankings, achievements, and anti-cheat scoring system (see [Anti-Cheat System](./leaderboards/anti-cheat-system.md))

### Key Files

| File | Purpose |
|------|---------||
| `README.md` | Quick start guide and project structure |
| `CONTRIBUTING.md` | Development workflow and conventions |
| `TODO.md` | Work log and pending tasks |
| `PRODUCTION_CHECKLIST.md` | Production deployment requirements |
| `docker-compose.yml` | Local development stack orchestration |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           FRONTEND                                   │
│                    Next.js 14 (App Router)                          │
│                      localhost:3000                                  │
└─────────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
┌─────────────────────────────┐  ┌─────────────────────────────┐
│         BACKEND             │  │     ACTIVITIES SERVICE       │
│    FastAPI (Python)         │  │   Fastify + Socket.IO        │
│     localhost:8000          │  │     localhost:4005           │
└─────────────────────────────┘  └─────────────────────────────┘
                    │                       │
                    └───────────┬───────────┘
                                ▼
        ┌───────────────────────────────────────────┐
        │              DATA LAYER                    │
        │  PostgreSQL 16    │    Redis 7.2          │
        │  localhost:5432   │    localhost:6379     │
        └───────────────────────────────────────────┘
```

### Monorepo Structure

```
Divan/
├── frontend/           # Next.js 14 application
├── backend/            # FastAPI Python backend
├── services/           # Microservices
│   └── activities-core/  # Real-time games service
├── infra/              # Infrastructure configs
│   ├── docker/         # Docker configurations
│   ├── migrations/     # SQL migrations
│   ├── grafana/        # Monitoring dashboards
│   ├── prometheus/     # Alert rules
│   └── k6/             # Load testing
├── scripts/            # Utility scripts
├── docs/               # Documentation
└── docker-compose.yml  # Local development stack
```

---

## 3. Tech Stack

### Backend

| Technology | Version | Purpose |
|------------|---------|---------||
| Python | 3.12+ | Runtime |
| FastAPI | ^0.110.0 | Web framework |
| Uvicorn | ^0.29.0 | ASGI server |
| asyncpg | ^0.29.0 | Async PostgreSQL driver |
| Redis | ^5.0.4 | Redis client |
| python-socketio | ^5.11.1 | WebSocket support |
| Pydantic | ^2.6.4 | Data validation |
| Argon2-cffi | ^23.1.0 | Password hashing |
| PyJWT | ^2.9.0 | JWT tokens |
| aiosmtplib | ^3.0.1 | Async email |
| prometheus-client | ^0.20.0 | Metrics |

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------||
| Next.js | ^14.2.3 | React framework |
| React | ^18.2.0 | UI library |
| TypeScript | ^5.4.5 | Type safety |
| Zustand | ^4.5.2 | State management |
| TanStack Query | ^5.90.5 | Data fetching |
| Socket.IO Client | ^4.7.5 | Real-time |
| Tailwind CSS | ^3.4.3 | Styling |
| Framer Motion | ^12.23.24 | Animations |
| Axios | ^1.13.1 | HTTP client |
| lucide-react | ^0.554.0 | Icons |

### Activities Service

| Technology | Version | Purpose |
|------------|---------|---------||
| Node.js | 20+ | Runtime |
| Fastify | Latest | HTTP server |
| Socket.IO | Latest | WebSocket |
| Prisma | Latest | ORM |
| TypeScript | Latest | Type safety |

### Infrastructure

| Technology | Version | Purpose |
|------------|---------|---------||
| PostgreSQL | 16-alpine | Primary database |
| Redis | 7.2-alpine | Cache, pub/sub, presence |
| Docker | Latest | Containerization |
| Grafana | Latest | Monitoring dashboards |
| Prometheus | Latest | Metrics collection |

---

## 4. Backend (FastAPI)

### Directory Structure

```
backend/
├── app/
│   ├── main.py              # Application entrypoint
│   ├── settings.py          # Environment configuration
│   │
│   ├── api/                  # REST API endpoints
│   │   ├── auth.py           # Registration, login, logout, refresh
│   │   ├── profile.py        # Profile CRUD, avatar upload
│   │   ├── social.py         # Invites & friendships
│   │   ├── chat.py           # Direct messaging
│   │   ├── rooms.py          # Group rooms & room chat
│   │   ├── activities.py     # Mini-games
│   │   ├── discovery.py      # Swipe-style discovery
│   │   ├── search.py         # User/room search
│   │   ├── proximity.py      # Presence & nearby lookup
│   │   ├── meetups.py        # Campus meetup events
│   │   ├── leaderboards.py   # Rankings & streaks
│   │   ├── verify.py         # Email verification
│   │   ├── passkeys.py       # WebAuthn support
│   │   ├── privacy.py        # Privacy settings
│   │   └── rbac.py           # Role-based access control
│   │
│   ├── domain/               # Business logic & models
│   │   ├── identity/         # Auth, sessions, 2FA, recovery
│   │   ├── social/           # Friendships, invites, blocking
│   │   ├── chat/             # DM conversations
│   │   ├── rooms/            # Group room management
│   │   ├── activities/       # Mini-game logic
│   │   ├── proximity/        # Geo-presence
│   │   ├── discovery/        # Swipe matching
│   │   ├── search/           # Full-text search
│   │   ├── meetups/          # Meetup scheduling
│   │   └── leaderboards/     # Points & streaks
│   │
│   ├── communities/          # Communities feature
│   │   ├── api/              # Group, post, comment endpoints
│   │   ├── domain/           # Community logic
│   │   ├── workers/          # Background workers
│   │   ├── jobs/             # Scheduled jobs
│   │   └── sockets/          # Real-time events
│   │
│   ├── moderation/           # Content moderation
│   │   ├── api/              # Mod case endpoints
│   │   ├── domain/           # Policies, detectors
│   │   ├── workers/          # Scanning workers
│   │   └── middleware/       # Request screening
│   │
│   ├── infra/                # Infrastructure utilities
│   │   ├── postgres.py       # Connection pool
│   │   ├── redis.py          # Redis client
│   │   ├── auth.py           # JWT auth
│   │   ├── rate_limit.py     # Rate limiting
│   │   └── idempotency.py    # Idempotent requests
│   │
│   └── obs/                  # Observability
│       ├── health.py         # Health checks
│       ├── metrics.py        # Prometheus metrics
│       ├── logging.py        # Structured logging
│       └── tracing.py        # OpenTelemetry
│
├── config/                   # Configuration files
│   ├── content_safety.yml    # Content moderation thresholds
│   └── moderation_reputation.yml
│
├── tests/                    # Test suites
│   ├── api/                  # API tests
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   ├── security/             # Security tests
│   └── sockets/              # WebSocket tests
│
├── scripts/                  # Backend scripts
├── Dockerfile                # Container definition
├── pyproject.toml            # Python dependencies
└── README.md                 # Backend documentation
```

### API Endpoints Summary

| Tag | Prefix | Purpose |
|-----|--------|---------||
| identity | `/auth/*` | Register, login, logout, refresh, 2FA |
| profile | `/users/*` | Profile CRUD, avatar upload |
| social | `/invites/*`, `/friends/*` | Friend management |
| chat | `/chat/*` | Direct messages |
| rooms | `/rooms/*` | Group rooms |
| activities | `/activities/*` | Mini-games |
| discovery | `/discovery/*` | Swipe feed |
| search | `/search/*` | User/room search |
| proximity | `/proximity/*`, `/heartbeat` | Presence |
| meetups | `/meetups/*` | Campus events |
| communities | `/communities/*` | Groups, posts |
| moderation | `/mod/*` | Content moderation |
| ops | `/health/*`, `/metrics` | Health & metrics |

---

## 5. Frontend (Next.js)

### Directory Structure

```
frontend/
├── app/                      # Next.js App Router pages
│   ├── (identity)/           # Auth pages
│   │   ├── login/
│   │   ├── forgot-password/
│   │   └── settings/
│   ├── (social)/             # Social pages
│   │   ├── friends/
│   │   ├── invites/
│   │   └── match/
│   ├── (activities)/         # Mini-games UI
│   ├── (rooms)/              # Group rooms
│   ├── (communities)/        # Community groups
│   ├── (chat)/               # Direct messaging
│   ├── (onboarding)/         # User onboarding
│   ├── (profiles)/           # Profile views
│   ├── (admin)/              # Admin pages
│   ├── (staff)/              # Staff tools
│   ├── discovery/            # Discovery deck
│   ├── search/               # Search page
│   ├── leaderboards/         # Rankings
│   ├── meetups/              # Meetups
│   ├── me/                   # User dashboard
│   └── proximity/            # Nearby users
│
├── components/               # Reusable UI components
│   ├── BrandLogo.tsx
│   ├── AppChrome.tsx         # App shell
│   ├── AuthenticatedAppChrome.tsx
│   ├── ChatWindow.tsx
│   ├── DiscoveryFeed.tsx
│   ├── FriendList.tsx
│   ├── ProfileForm.tsx
│   ├── RoomChat.tsx
│   ├── SearchBar.tsx
│   ├── communities/          # Community components
│   ├── notifications/        # Notification components
│   └── proximity/            # Proximity components
│
├── lib/                      # Shared utilities & API
│   ├── api.ts                # Core API client
│   ├── auth-guard.tsx        # Auth HOC
│   ├── socket.ts             # Socket.IO client
│   ├── chat.ts               # Chat API
│   ├── social.ts             # Social API
│   ├── communities.ts        # Communities API
│   ├── discovery.ts          # Discovery API
│   └── search.ts             # Search API
│
├── hooks/                    # Custom React hooks
│   ├── activities/           # Activity hooks
│   ├── chat/                 # Chat hooks
│   ├── communities/          # Community hooks
│   ├── notifications/        # Notification hooks
│   ├── presence/             # Presence hooks
│   └── social/               # Social hooks
│
├── store/                    # Zustand stores
│   └── presence.ts           # Presence state
│
├── utils/                    # Utility functions
│   ├── datetime.ts
│   └── search.ts
│
├── middleware.ts             # Auth middleware
├── tailwind.config.ts        # Tailwind configuration
├── next.config.js            # Next.js configuration
├── tsconfig.json             # TypeScript configuration
└── package.json              # Dependencies
```

### Scripts

```bash
npm run dev        # Start dev server (Turbopack)
npm run build      # Production build
npm run start      # Start production server
npm run lint       # ESLint
npm run typecheck  # TypeScript check
npm run test       # Vitest unit tests
npm run test:e2e   # Playwright E2E tests
```

### Middleware (Route Protection)

The `middleware.ts` file protects authenticated routes:

- **Public paths**: `/login`, `/signup`, `/join`, `/onboarding`, `/forgot-password`
- **Protected paths**: Everything else requires authentication
- **Auth cookies checked**: `session_id`, `divan_auth`, `token`, `access_token`

---

## 6. Services

### Activities Core Service

**Location**: `services/activities-core/`

**Purpose**: Real-time mini-game service handling:
- Speed Typing Duel
- Quick Trivia
- Rock Paper Scissors
- Tic-Tac-Toe
- Story Builder

**Structure**:
```
services/activities-core/
├── src/
│   ├── index.ts              # Server entrypoint
│   ├── routes/               # HTTP routes
│   ├── ws/                   # WebSocket handlers
│   │   ├── tictactoe.ts      # Tic-Tac-Toe game
│   │   ├── quickTrivia.ts    # Trivia game
│   │   └── storyBuilder.ts   # Story builder game
│   ├── services/
│   │   └── stats.ts          # Game statistics
│   └── lib/
│       └── db.ts             # Database connection
├── prisma/                   # Prisma schema
├── tests/                    # Jest tests
└── package.json
```

**Port**: `4005`

**Scripts**:
```bash
npm run dev        # Start with hot reload
npm run build      # Compile TypeScript
npm run start      # Start production
npm run test       # Run tests
```

---

## 7. Infrastructure

### Docker Compose Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------||
| `postgres` | postgres:16-alpine | 5432 | Primary database |
| `redis` | redis:7.2-alpine | 6379 | Cache, presence, pub/sub |
| `backend` | Custom Dockerfile | 8000 | FastAPI backend |
| `mailhog` | mailhog/mailhog | 8025 | Dev email testing |

### Infrastructure Files

```
infra/
├── docker/
│   ├── compose.yaml
│   ├── compose.frontend.yaml
│   └── redis.conf
│
├── migrations/               # 66+ SQL migrations
│   ├── 000B00_baseline.sql
│   ├── 000B01_add_sessions.sql
│   ├── 000B02_users_soft_delete.sql
│   └── ...
│
├── grafana/
│   └── dashboards/
│       ├── backend-overview.json
│       ├── chat-proximity.json
│       └── redis-postgres.json
│
├── prometheus/
│   └── rules-phase8.yml      # Alert rules
│
├── k6/                       # Load testing scripts
│
└── hardening/                # Security documentation
    ├── phase-A/              # Auth hardening
    ├── phase-B/
    ├── phase-C/
    ├── phase-D/
    └── phase-E/              # RBAC, signed intents
```

---

## 8. Database Schema

### Core Tables

| Table | Purpose |
|-------|---------||
| `campuses` | University campuses with geo coordinates |
| `users` | User accounts (handle, email, password_hash, bio, avatar) |
| `friendships` | Friend relationships (pending/accepted/blocked) |
| `invitations` | Friend invite requests |
| `sessions` | User login sessions |
| `email_verifications` | Email verification tokens |
| `password_resets` | Password reset tokens |
| `twofa` | Two-factor authentication secrets |
| `recovery_codes` | 2FA recovery codes |

### Chat & Rooms

| Table | Purpose |
|-------|---------||
| `rooms` | Group chat rooms |
| `room_members` | Room membership |
| `room_messages` | Room chat messages |
| `chat_conversations` | DM conversations |
| `chat_messages` | Direct messages |

### Activities

| Table | Purpose |
|-------|---------||
| `activity_sessions` | Mini-game sessions |
| `activity_rounds` | Game rounds |
| `typing_submissions` | Typing duel entries |
| `trivia_questions` | Trivia question bank |
| `trivia_answers` | User answers |
| `rps_moves` | Rock-paper-scissors moves |
| `story_lines` | Collaborative story entries |

### Communities

| Table | Purpose |
|-------|---------||
| `group_entity` | Community groups |
| `group_member` | Membership |
| `post` | Community posts |
| `comment` | Post comments |
| `topic_tag` | Topic tags |

### Meetups

| Table | Purpose |
|-------|---------||
| `meetups` | Campus meetup events |
| `meetup_participants` | Attendance |

### Moderation

| Table | Purpose |
|-------|---------||
| `mod_policy` | Moderation policies |
| `mod_case` | Moderation cases |
| `mod_action` | Actions taken |
| `mod_appeal` | User appeals |
| `trust_score` | User trust scores |

---

## 9. Scripts & Utilities

### Database Scripts

| Script | Purpose |
|--------|---------||
| `apply_migrations.py` | Apply all database migrations |
| `apply_single_migration.py` | Apply a specific migration |
| `seed_demo_data.py` | Seed database with test data |
| `seed_demo_users.py` | Create demo users |
| `seed_campus.py` | Seed campus data |

### User Management

| Script | Purpose |
|--------|---------||
| `register_user.py` | Register a new user |
| `verify_email.py` | Verify user email |
| `dump_users.py` | Export user data |
| `check_recent_users.py` | Check recent registrations |
| `delete_demo_users.ps1` | Delete demo users |

### Development

| Script | Purpose |
|--------|---------||
| `dev_run_backend.sh` | Start backend dev server |
| `dev_run_frontend.sh` | Start frontend dev server |
| `test_db_connection.py` | Test database connectivity |
| `smoke_auth_refresh.py` | Test auth token refresh |
| `reset_docker.ps1` | Reset Docker containers |

---

## 10. Security Features

### Authentication

- **Password Hashing**: Argon2id (memory-hard)
- **Access Tokens**: JWT with 15-minute TTL
- **Refresh Tokens**: 30-day TTL, HTTP-only cookies
- **Session Management**: Server-side session tracking
- **2FA/TOTP**: Time-based one-time passwords
- **Recovery Codes**: Backup codes for 2FA
- **WebAuthn/Passkeys**: Passwordless authentication

### Authorization

- **RBAC**: Role-based access control (user, moderator, admin)
- **Signed Intents**: Cryptographically signed admin requests
- **Campus Scoping**: Data isolation per campus

### Protection

- **Rate Limiting**: Redis-based on sensitive endpoints
- **CSRF Protection**: Token validation
- **Content Moderation**: Text toxicity and image NSFW scanning
- **Soft Delete**: Recoverable user deletion
- **Audit Logging**: Security event tracking

---

## 11. Observability

### Metrics (Prometheus)

Endpoint: `http://localhost:8000/metrics`

Key metrics:
- Request latency histograms
- Error rates
- Active connections
- Database pool stats
- Redis connection stats

### Dashboards (Grafana)

| Dashboard | Purpose |
|-----------|---------||
| `backend-overview.json` | API performance overview |
| `chat-proximity.json` | Chat and presence metrics |
| `redis-postgres.json` | Database health |

### Logging

- Structured JSON logs
- Request ID correlation
- Error stack traces
- Audit trail for security events

### Alerting

Rules defined in `infra/prometheus/rules-phase8.yml`:
- High error rates
- Latency spikes
- Connection failures
- Resource exhaustion

---

## 12. Development Guide

### Prerequisites

- **Docker Desktop**: For database and services
- **Node.js 20+**: For frontend and activities service
- **Python 3.12+**: For backend (if running locally)
- **pnpm** (recommended): Package manager

### Quick Start

```powershell
# 1. Start infrastructure
docker compose up -d

# 2. Start backend (included in docker-compose)
# API available at http://localhost:8000

# 3. Start frontend
cd frontend
npm install
npm run dev
# App at http://localhost:3000

# 4. Start activities service (optional)
cd services/activities-core
npm install
npm run dev
# Service at http://localhost:4005
```

### Environment Variables

**Backend** (via docker-compose):
```env
POSTGRES_URL=postgresql://postgres:postgres@postgres:5432/divan
REDIS_URL=redis://redis:6379/0
SECRET_KEY=your-secret-key
ENVIRONMENT=dev
```

**Frontend** (`frontend/.env.local`):
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_ACTIVITIES_URL=http://localhost:4005
```

### Running Tests

```powershell
# Backend tests
cd backend
pytest

# Frontend unit tests
cd frontend
npm run test

# Frontend E2E tests
cd frontend
npm run test:e2e
```

---

## 13. API Reference

### Authentication

```http
POST /auth/register    # Create account
POST /auth/login       # Login (returns tokens)
POST /auth/refresh     # Refresh access token
POST /auth/logout      # Logout (invalidate session)
POST /auth/2fa/enable  # Enable 2FA
POST /auth/2fa/verify  # Verify 2FA code
```

### Profile

```http
GET  /users/me         # Get current user profile
PUT  /users/me         # Update profile
POST /users/me/avatar  # Upload avatar
GET  /users/:handle    # Get user by handle
```

### Social

```http
GET  /friends          # List friends
POST /invites          # Send friend invite
GET  /invites/incoming # Incoming invites
POST /invites/:id/accept
POST /invites/:id/reject
DELETE /friends/:id    # Remove friend
POST /users/:id/block  # Block user
```

### Chat

```http
GET  /chat/conversations      # List DM conversations
POST /chat/conversations      # Start conversation
GET  /chat/conversations/:id  # Get messages
POST /chat/conversations/:id  # Send message
```

### Rooms

```http
GET  /rooms            # List rooms
POST /rooms            # Create room
GET  /rooms/:id        # Get room details
POST /rooms/:id/join   # Join room
POST /rooms/:id/leave  # Leave room
GET  /rooms/:id/messages
POST /rooms/:id/messages
```

### Discovery

```http
GET  /discovery/feed   # Get discovery deck
POST /discovery/like   # Like profile
POST /discovery/pass   # Pass on profile
POST /discovery/undo   # Undo last action
GET  /discovery/matches # Get matches
```

### Activities

```http
GET  /activities/sessions        # List game sessions
POST /activities/sessions        # Create session
GET  /activities/sessions/:id    # Get session
POST /activities/sessions/:id/join
POST /activities/sessions/:id/start
```

### Proximity

```http
POST /heartbeat        # Update presence
GET  /proximity/nearby # Get nearby users
```

---

## License

This project is private and proprietary to the Divan team.

---

*Last updated: December 2, 2025*
