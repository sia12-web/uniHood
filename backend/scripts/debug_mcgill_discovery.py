
import asyncio
import os
import sys

# Add backend to path
sys.path.append(os.getcwd())

from app.infra.postgres import init_pool
from uuid import UUID

async def check():
    pool = await init_pool()
    async with pool.acquire() as conn:
        print("--- Campus Check ---")
        mcgill_id = 'c4f7d1ec-7b01-4f7b-a1cb-4ef0a1d57ae2'
        mcgill = await conn.fetchrow("SELECT id, name FROM campuses WHERE id = $1", mcgill_id)
        if mcgill:
            print(f"Found McGill: {mcgill['name']} ({mcgill['id']})")
        else:
            print(f"McGill ID {mcgill_id} NOT found!")
            all_campuses = await conn.fetch("SELECT id, name FROM campuses LIMIT 10")
            for c in all_campuses: print(f" - {c['name']} ({c['id']})")
            
        print("\n--- User Check ---")
        emails = ['delbouka@gmail.com', 'siavashshahbazifar@gmail.com']
        users = await conn.fetch("SELECT id, email, handle, campus_id, is_university_verified, deleted_at FROM users WHERE email = ANY($1)", emails)
        for u in users:
            print(f"User: {u['email']}")
            print(f"  ID: {u['id']}")
            print(f"  Handle: {u['handle']}")
            print(f"  Campus: {u['campus_id']}")
            print(f"  Verified: {u['is_university_verified']}")
            print(f"  Deleted: {u['deleted_at']}")
            
        if len(users) < 2:
            print("\nWARNING: One or both test users missing from DB!")
            
        if len(users) == 2:
            u1, u2 = users[0]['id'], users[1]['id']
            friends = await conn.fetchval("SELECT count(*) FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)", u1, u2)
            print(f"\nFriendship status: {friends} records found (count > 0 means they are already friends)")
            
            shared_courses = await conn.fetchval("""
                SELECT count(*) 
                FROM user_courses uc1 
                JOIN user_courses uc2 ON uc1.course_code = uc2.course_code 
                WHERE uc1.user_id = $1 AND uc2.user_id = $2
            """, u1, u2)
            print(f"Shared courses: {shared_courses}")
            
    print("\n--- Done ---")

if __name__ == "__main__":
    asyncio.run(check())
