import asyncio
import random
import uuid
import time
import os
import sys
from datetime import datetime

# Add backend to path to import app modules
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.infra.postgres import get_pool
from app.infra.redis import redis_client
from app.settings import settings

# Constants
CAMPUS_ID = "33333333-3333-3333-3333-333333333333"
CAMPUS_LAT = 37.7749
CAMPUS_LON = -122.4194

MAJORS = [
    "Computer Science", "Psychology", "Mechanical Engineering", "Biology",
    "Economics", "English Literature", "Political Science", "Mathematics",
    "Physics", "Chemistry", "History", "Sociology", "Art History",
    "Business Administration", "Marketing", "Finance", "Philosophy",
    "Anthropology", "Environmental Science", "Data Science"
]

FIRST_NAMES = [
    "Emma", "Liam", "Olivia", "Noah", "Ava", "Oliver", "Isabella", "Elijah",
    "Sophia", "Lucas", "Mia", "Mason", "Charlotte", "Logan", "Amelia",
    "Alexander", "Harper", "Ethan", "Evelyn", "Jacob", "Abigail", "Michael",
    "Emily", "Daniel", "Elizabeth", "Henry", "Sofia", "Jackson", "Avery",
    "Sebastian"
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
    "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez",
    "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin"
]

BIOS = [
    "Loves coding and coffee.", "Aspiring artist.", "Future CEO.",
    "Nature lover and hiker.", "Bookworm.", "Gamer for life.",
    "Music enthusiast.", "Travel addict.", "Foodie.", "Fitness freak.",
    "Tech geek.", "History buff.", "Animal lover.", "Photographer.",
    "Dreamer.", "Doer.", "Always learning.", "Just here for the vibes.",
    "Student of life.", "Coffee addict."
]

async def seed_users():
    print("Connecting to database...")
    pool = await get_pool()
    
    users = []
    for i in range(20):
        first = random.choice(FIRST_NAMES)
        last = random.choice(LAST_NAMES)
        handle = f"{first.lower()}{last.lower()}{random.randint(1, 99)}"
        display_name = f"{first} {last}"
        major = random.choice(MAJORS)
        grad_year = datetime.now().year + random.randint(0, 4) # 2024-2028
        bio = random.choice(BIOS)
        user_id = str(uuid.uuid4())
        
        users.append({
            "id": user_id,
            "handle": handle,
            "display_name": display_name,
            "major": major,
            "graduation_year": grad_year,
            "bio": bio,
            "campus_id": CAMPUS_ID,
            "email": f"{handle}@example.com"
        })

    print(f"Inserting {len(users)} users...")
    
    async with pool.acquire() as conn:
        # Ensure campus exists
        await conn.execute("""
            INSERT INTO campuses (id, name, lat, lon)
            VALUES ($1, 'Main Campus', $2, $3)
            ON CONFLICT (id) DO NOTHING
        """, CAMPUS_ID, CAMPUS_LAT, CAMPUS_LON)

        for user in users:
            # Insert user
            await conn.execute("""
                INSERT INTO users (id, handle, display_name, email, campus_id, major, graduation_year, bio, privacy)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '{"visibility":"everyone","blur_distance_m":10}')
                ON CONFLICT (id) DO NOTHING
            """, user["id"], user["handle"], user["display_name"], user["email"], user["campus_id"], user["major"], user["graduation_year"], user["bio"])
            
            # Also ensure handle uniqueness conflict doesn't break it (simplified)
            
    return users

async def seed_presence(users):
    print("Seeding presence in Redis...")
    
    for user in users:
        # Random location around campus (within ~500m)
        # 1 degree lat ~ 111km. 500m = 0.5km = 0.0045 degrees
        lat_offset = random.uniform(-0.0045, 0.0045)
        lon_offset = random.uniform(-0.0045, 0.0045)
        
        lat = CAMPUS_LAT + lat_offset
        lon = CAMPUS_LON + lon_offset
        
        user_id = user["id"]
        now_ms = int(time.time() * 1000)
        
        # Add to Geo Set
        await redis_client.geoadd(
            f"geo:presence:{CAMPUS_ID}", {user_id: (lon, lat)}
        )
        
        # Add to Presence Hash
        await redis_client.hset(
            f"presence:{user_id}",
            mapping={
                "lat": lat,
                "lon": lon,
                "accuracy_m": 10,
                "ts": now_ms,
                "device_id": "demo-device",
                "campus_id": CAMPUS_ID,
                "venue_id": "",
            },
        )
        
        # Set Expiry (make them last for 1 hour for demo purposes)
        await redis_client.expire(f"presence:{user_id}", 3600)
        await redis_client.setex(f"online:user:{user_id}", 3600, "1")
        
    print("Presence seeded.")

async def main():
    users = await seed_users()
    await seed_presence(users)
    print("Done!")

if __name__ == "__main__":
    asyncio.run(main())
