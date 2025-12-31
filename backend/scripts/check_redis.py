import asyncio
import redis.asyncio as redis
import os
from dotenv import load_dotenv

async def check_redis():
    load_dotenv()
    # Default if not in env
    url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    print(f"Connecting to {url}")
    try:
        client = redis.from_url(url)
        print("Connected successfully!")
        await client.ping()
        print("Ping successful!")
        await client.close()
    except Exception as e:
        print(f"Failed to connect: {e}")

if __name__ == "__main__":
    asyncio.run(check_redis())
