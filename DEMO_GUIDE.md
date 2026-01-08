# 🎓 uniHood: Technical Demo & Interview Guide

**Role Target:** Full Stack / Backend / Frontend Developer  
**Project:** uniHood (Real-time Campus Social Platform)

---

## 1. 🎤 The "Elevator Pitch" (30 Seconds)
*"I built uniHood to solve the problem of digital isolation on university campuses. It's a real-time, location-based social platform that connects students through shared activities rather than just static feeds. Unlike a standard CRUD app, uniHood uses a microservices architecture to handle real-time gaming, geospatial discovery, and instant messaging with low latency, bridging the gap between a chat app and a massive multiplayer game."*

---

## 2. 🏗️ Architecture & Tech Stack (The "How")

### **Frontend: "Native-like Performance on Web"**
*   **Framework**: Next.js 14 (App Router) for hybrid server/client rendering.
*   **State Management**: React Query (server state) + Zustand (local client state) for snappy optimistic updates.
*   **UI/UX**: Tailwind CSS + Framer Motion. I focused heavily on **Mobile-First** design, ensuring touch targets and layouts adapt like a native iOS app.
*   **Real-time**: Custom hooks orchestrating Socket.io connections that auto-reconnect and sync state.

### **Backend: "Service-Oriented & Scalable"**
*   **Core API**: FastAPI (Python). Chosen for high-performance async capabilities and ease of typing (Pydantic).
*   **Microservices (Activities)**: Node.js + Socket.io. I split this off because game loops require high-concurrency event loops that Node handles exceptionally well.
*   **Database**: PostgreSQL with **PostGIS** extension. This allows efficient geospatial queries (e.g., "Find events within 500m of this lat/long").
*   **Caching/PubSub**: Redis. Used for:
    *   Session storage (fast access).
    *   Pub/Sub for distributing WebSocket events across service instances.
    *   Rate limiting and "Diminishing Returns" logic for XP.

---

## 3. 🧠 Key Algorithms & "Star" Logic
*These are the complex parts you should highlight to show you're not just copying tutorials.*

### **A. The "Anti-Cheat" XP System**
*   **Challenge**: Users could spam actions (like joining/leaving meetups or messaging friends) to farm XP.
*   **Algorithm**: **Diminishing Returns with Redis Sliding Windows**.
    *   I track interactions between User A and User B in Redis with a 24-hour TTL.
    *   *1st Interaction (e.g., Upvote)*: 100% XP.
    *   *2nd Interaction*: 50% XP.
    *   *3rd+ Interaction*: 0% XP.
    *   This encourages diverse social behavior rather than repetitive spamming.

### **B. Geospatial Discovery (PostGIS)**
*   **Challenge**: "Show me meetups near me" is computationally expensive if you calculate distance for every row.
*   **Solution**: specialized **Spatial Indexing (GiST)**.
*   **Query**: `ST_DWithin(user_location, meetup_location, 1000)` efficiently filters millions of rows to find those within 1km.

### **C. Real-time Game State Synchronization**
*   **Challenge**: In "Speed Typing" or "Rock Paper Scissors", lag or race conditions can ruin the game.
*   **Solution**: **Optimistic UI + Server Authority**.
    *   *Client*: Updates UI immediately upon keypress (Speed Typing) for 0-latency feel.
    *   *Server*: The source of truth. It validates the timestamp and input, broadcasing the "confirmed" state.
    *   *Sync*: If the server diverges (drift), the client reconciles state seamlessly.

---

## 4. 🎬 The Live Demo Script (Walkthrough)

**Preparation**: Have the app open in two separate browser windows (Incognito for the 2nd one) to show real-time interaction between "User A" and "User B".

1.  **The "Hook" (Landing & Auth)**
    *   Show the **Landing Page**. Point out the "University Verification" feature.
    *   *Login as User A*. Highlight the speed of the transition (Next.js prefetching).

2.  **The "Social Graph" (Discovery)**
    *   Go to **Discovery/Map**. Show the toggle between "Campus Mode" (my university) vs "City Mode" (all nearby).
    *   *Tech Highlight*: "This query dynamically adjusts visibility based on my campus ID and subscription level."

3.  **The "Real-time" Moment (Games)**
    *   *User A*: Create a **Quick Trivia** lobby.
    *   *User B*: Should see the invite instantly (WebSockets).
    *   **Play a round**: Answer questions on both screens. Show how the score updates instantly on both sides without refreshing.
    *   *Tech Highlight*: "This is powered by a separate Node.js microservice handling the game loop."

4.  **The "Complex Data" (Meetup Creation)**
    *   Create a Meetup.
    *   Show the **Visibility** dropdown (Global/Campus/Friends).
    *   Explain the DB schema: "I designed a flexible permission system where a meetup created by a Concordia student can be visible to McGill students if 'City Mode' is allowed."

5.  **The "Reward" (XP & Profile)**
    *   Finish the game or meetup.
    *   Go to **Profile**. Show the new XP/Level progress.
    *   *Tech Highlight*: "This calculation happened asynchronously in the background so the user experience wasn't blocked."

---

## 5. 🙋‍♂️ Anticipated Interview Questions (Q&A)

**Q: Why did you separate the Game Service (Node) from the Main API (Python)?**
**A**: FastAPI is excellent for the REST API and business logic (heavy data validation). However, Node.js has a very mature ecosystem for WebSockets (Socket.io) and its event loop is perfect for handling thousands of concurrent lightweight game connections. Separation also allows independent scaling—if games get popular, I scale the Node containers without touching the main API.

**Q: How do you handle database migrations?**
**A**: I use SQL-based migrations (custom scripts or tools like Alembic) ensuring that schema changes are version-controlled and reproducible across Dev and Prod environments.

**Q: How do you secure user data?**
**A**:
*   **Transport**: HTTPS everywhere.
*   **Auth**: HTTP-Only Secure Cookies for JWTs (prevents XSS attacks stealing tokens).
*   **Validation**: Pydantic schemas on the backend strictly sanitise all inputs.

**Q: What was the hardest bug you fixed?**
**A**: *Pick the "Cross-Campus Visibility" issue.*
"I had a bug where 'City-wide' meetups weren't showing up for students at other universities. The SQL query was strictly filtering by `campus_id`. I had to refactor the query to support conditional logic: `(is_campus_match OR visibility = 'CITY')`. It taught me a lot about writing complex, performant SQL filters."

---
