
import asyncio
import os
from app.infra.postgres import get_pool

async def check_schema():
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Check columns
        columns = await conn.fetch("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'daily_xp_claims';
        """)
        print("Columns:")
        for c in columns:
            print(f"- {c['column_name']}: {c['data_type']}")
            
        # Check constraints
        constraints = await conn.fetch("""
            SELECT tc.constraint_name, tc.constraint_type
            FROM information_schema.table_constraints tc
            WHERE tc.table_name = 'daily_xp_claims';
        """)
        print("\nConstraints:")
        for c in constraints:
            print(f"- {c['constraint_name']}: {c['constraint_type']}")

if __name__ == "__main__":
    # Ensure env vars are loaded if needed (dotenv)
    from dotenv import load_dotenv
    load_dotenv()
    
    asyncio.run(check_schema())
