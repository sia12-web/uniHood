# uniHood

> **Live Demo:** [unihood.app](https://unihood.app)

**uniHood** is a real-time, campus-based social platform designed to bring the university "third place" into the digital age. It's a living, breathing digital campus where you can bump into friends, challenge rivals to quick games, and find your community via proximity-based discovery.

---

## ✨ Features

- **📍 Campus Identity**: Verify your university email to join your school's exclusive network.
- **📈 Social XP & Levels**: Earn reputation by hosting events, winning games, and socializing. Level up to unlock perks like hosting larger meetups, "City Mode" discovery, and elite profile badges.
- **📅 Smart Meetups**: Host study sessions, parties, or club events with flexible visibility (Campus-wide, City-wide, or Friends-only). Includes built-in attendee tracking and automated reminders.
- **🎮 Real-Time Activities**: unique micro-games like **Speed Typing**, **Quick Trivia**, and **Rock Paper Scissors**.
- **💬 Live Messaging**: Instant DMs and group chats powered by WebSockets.
- **📱 Mobile-First Design**: A responsive interface that feels like a native app on any device.
- **🗺️ Discovery**: Find events and meetups happening physically near you.

## 🚀 Quick Start

Get the project running locally in minutes using Docker.

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local frontend dev)

### Installation

1.  **Clone the repo**
    ```bash
    git clone https://github.com/sia12-web/Divan.git unihood
    cd unihood
    ```

2.  **Start Backend & Services**
    ```bash
    docker-compose up -d
    ```

3.  **Start Frontend**
    ```bash
    cd frontend
    npm install
    npm run dev
    ```

4.  **Visit the App**
    Open [http://localhost:3000](http://localhost:3000)

## 📂 Project Structure

A clean, microservices-ready architecture:

```
├── backend/            # FastAPI (Python) - Core logic & REST APIs
├── frontend/           # Next.js 14 (TypeScript) - App Router & UI
├── services/           # Microservices (Node.js) - Real-time activities
├── infra/              # Infrastructure code (Terraform, Docker)
├── docs/               # Documentation & assets
└── roadmap/            # Project planning & changelogs
```

## 🗺️ Roadmap & Updates

We maintain a clear path for development and track all changes.

- **[Roadmap](./roadmap/ROADMAP.md)**: See what's coming next (Study Groups, Push Notifications, etc.)
- **[Changelog](./roadmap/CHANGELOG.md)**: Track the latest updates and fixes.

## 🤝 Contributing

We welcome contributions!

- Check out issues labeled **"good first issue"** to get started.
- Please read our [CONTRIBUTING.md](./CONTRIBUTING.md) guide before submitting a Pull Request.

---

Built with ❤️ by Siavash & The uniHood Team.
