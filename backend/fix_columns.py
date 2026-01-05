import asyncio
from app.infra.postgres import get_pool

async def main():
    pool = await get_pool()
    async with pool.acquire() as conn:
        print("Adding columns to campuses...")
        try:
            await conn.execute("ALTER TABLE campuses ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION")
            print("Added lat")
        except Exception as e:
            print(f"Failed lat: {e}")
            
        try:
            await conn.execute("ALTER TABLE campuses ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION")
            print("Added lon")
        except Exception as e:
            print(f"Failed lon: {e}")
            
    await pool.close()

if __name__ == "__main__":
    asyncio.run(main())
