import asyncio
import json
import random
import asyncpg

DB_DSN = "postgresql://postgres:postgres@localhost:5432/divan"

# Using picsum for reliable random images, or pravatar for faces
# Pravatar is better for "users"
def get_random_avatar(seed):
    return f"https://i.pravatar.cc/400?u={seed}"

def get_random_scenery(seed):
    return f"https://picsum.photos/seed/{seed}/400/500"

async def seed_pictures():
    print(f"Connecting to {DB_DSN}...")
    conn = await asyncpg.connect(DB_DSN)
    try:
        users = await conn.fetch("SELECT id, handle FROM users WHERE deleted_at IS NULL")
        print(f"Found {len(users)} users.")

        for user in users:
            user_id = str(user["id"])
            handle = user["handle"]
            
            # Generate 3-5 images
            # 1st is face (avatar)
            # Others are mix of faces or scenery
            
            images = []
            
            # Image 1: Avatar
            avatar_url = get_random_avatar(handle)
            images.append({
                "key": f"demo/{handle}/1",
                "url": avatar_url,
                "uploaded_at": "2024-01-01T00:00:00Z"
            })
            
            # Image 2: Scenery/Lifestyle
            images.append({
                "key": f"demo/{handle}/2",
                "url": get_random_scenery(f"{handle}_2"),
                "uploaded_at": "2024-01-01T00:00:00Z"
            })
            
            # Image 3: Another face or scenery
            images.append({
                "key": f"demo/{handle}/3",
                "url": get_random_scenery(f"{handle}_3"),
                "uploaded_at": "2024-01-01T00:00:00Z"
            })

            gallery_json = json.dumps(images)
            
            await conn.execute(
                """
                UPDATE users 
                SET avatar_url = $1, 
                    profile_gallery = $2::jsonb,
                    updated_at = NOW()
                WHERE id = $3
                """,
                avatar_url,
                gallery_json,
                user_id
            )
            print(f"Updated {handle} with 3 images.")
            
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(seed_pictures())
