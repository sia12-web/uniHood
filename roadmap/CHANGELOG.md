# 📋 Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **University Verification**: New page at `/verify-university` for seamless campus verification flow.
- **Roadmap & Changelog**: Added project documentation to track progress and updates.

### Changed
- **Meetup Banners**: Updated default meetup images to use high-quality Unsplash assets.
- **Game UI**: Removed raw UUID display from Speed Typing and Quick Trivia interfaces for privacy.
- **XP System**: Rebalanced scoring values to match leaderboard definitions (Meetup Join: 30 XP, Chat Sent: 1 XP).
- **Profile Unlocks**: Refined unlockable perks across levels to simplify the progression system.

### Fixed
- **Image Loading**: Resolved broken image links in the Meetup creation modal.
- **Verification Routing**: Fixed 404 error on university verification page by ensuring middleware access.

## [v0.9.0] - 2026-01-05

### Added
- **Speed Typing**: A new real-time activity for 1v1 typing duels.
- **Quick Trivia**: Fast-paced trivia challenges.
- **Rock Paper Scissors**: Classic game with a tense reveal mechanic.

### Changed
- **Mobile UI**: Complete overhaul of the frontend for a native-app-like mobile experience.
- **Navigation**: Simplified bottom navigation bar for easier access to core features.

## [v0.8.0] - 2025-12-15

### Added
- **Campus Identity**: Core backend support for parsing and verifying university emails.
- **Discovery Engine**: Proximity-based user finding service using PostGIS.

### Security
- **Auth**: Implemented JWT-based authentication with secure HTTP-only cookies.
