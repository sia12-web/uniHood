import random
import time
import uuid
import httpx

API_URL = "http://localhost:8000"
CAMPUS_ID = "33333333-3333-3333-3333-333333333333"
CAMPUS_LAT = 37.7749
CAMPUS_LON = -122.4194

MAJORS = [
    "Computer Science", "Psychology", "Biology", "Economics", "Business",
    "Engineering", "Art History", "Physics", "Mathematics", "English",
    "Political Science", "Chemistry", "Sociology", "Philosophy", "History"
]

BIOS = [
    "Loves coffee and coding.", "Hiking enthusiast.", "Always learning.",
    "Music lover.", "Gamer.", "Foodie.", "Traveler.", "Bookworm.",
    "Art addict.", "Nature lover.", "Tech geek.", "Fitness freak.",
    "Movie buff.", "Cat person.", "Dog person."
]

FIRST_NAMES = [
    "James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda",
    "William", "Elizabeth", "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
    "Thomas", "Sarah", "Charles", "Karen", "Christopher", "Nancy", "Daniel", "Lisa",
    "Matthew", "Betty", "Anthony", "Margaret", "Mark", "Sandra"
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
    "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
    "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson"
]

def generate_random_user(index):
    first = random.choice(FIRST_NAMES)
    last = random.choice(LAST_NAMES)
    # Add index to ensure uniqueness if names repeat
    handle = f"{first.lower()}{last.lower()}{random.randint(100, 999)}{index}"
    # Ensure handle is unique-ish and valid length (max 20 chars)
    handle = handle[:20]
    
    return {
        "email": f"{handle}@example.com",
        "password": "password123",
        "handle": handle,
        "display_name": f"{first} {last}",
        "campus_id": CAMPUS_ID
    }

def register_and_setup(user_data):
    # 1. Register
    try:
        resp = httpx.post(f"{API_URL}/auth/register", json=user_data, timeout=10.0)
        resp.raise_for_status()
        print(f"Registered {user_data['handle']}")
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 409:
            print(f"User {user_data['handle']} already exists, attempting login...")
        else:
            print(f"Failed to register {user_data['handle']}: {e}")
            return
    except Exception as e:
        print(f"Connection error registering {user_data['handle']}: {e}")
        return

    # 2. Login
    try:
        login_data = {
            "email": user_data["email"],
            "password": user_data["password"]
        }
        resp = httpx.post(f"{API_URL}/auth/login", json=login_data, timeout=10.0)
        resp.raise_for_status()
        token = resp.json()["access_token"]
    except Exception as e:
        print(f"Failed to login {user_data['handle']}: {e}")
        return

    headers = {"Authorization": f"Bearer {token}"}

    # 3. Update Profile
    profile_patch = {
        "major": random.choice(MAJORS),
        "graduation_year": random.randint(2024, 2028),
        "bio": random.choice(BIOS),
        "display_name": user_data["display_name"]
    }
    try:
        resp = httpx.patch(f"{API_URL}/profile/me", json=profile_patch, headers=headers, timeout=10.0)
        resp.raise_for_status()
        print(f"Updated profile for {user_data['handle']}")
    except Exception as e:
        print(f"Failed to update profile for {user_data['handle']}: {e}")

    # 4. Send Heartbeat
    # Random offset within ~1km (approx 0.01 deg lat/lon)
    lat_offset = (random.random() - 0.5) * 0.02
    lon_offset = (random.random() - 0.5) * 0.02
    
    heartbeat_payload = {
        "lat": CAMPUS_LAT + lat_offset,
        "lon": CAMPUS_LON + lon_offset,
        "accuracy_m": 10,
        "device_id": f"device_{user_data['handle']}",
        "ts_client": int(time.time() * 1000),
        "campus_id": CAMPUS_ID
    }
    
    try:
        resp = httpx.post(f"{API_URL}/presence/heartbeat", json=heartbeat_payload, headers=headers, timeout=10.0)
        resp.raise_for_status()
        print(f"Sent heartbeat for {user_data['handle']}")
    except Exception as e:
        print(f"Failed to send heartbeat for {user_data['handle']}: {e}")

def main():
    print("Seeding 20 demo users...")
    for i in range(20):
        user_data = generate_random_user(i)
        register_and_setup(user_data)
        time.sleep(0.05) # Slight delay

if __name__ == "__main__":
    main()
