import asyncio
from app.infra.postgres import get_pool
from uuid import UUID

MCGILL_CAMPUS_ID = "c4f7d1ec-7b01-4f7b-a1cb-4ef0a1d57ae2"
MCGILL_CAMPUS_DOMAIN = None
MCGILL_CAMPUS_NAME = "McGill University"
MCGILL_LAT = 45.5048
MCGILL_LON = -73.5772

async def main():
    pool = await get_pool()
    async with pool.acquire() as conn:
        print("Checking columns in campuses...")
        cols = await conn.fetch("SELECT column_name FROM information_schema.columns WHERE table_name = 'campuses'")
        col_names = [r['column_name'] for r in cols]
        print(f"Columns: {col_names}")
        
        print("Seeding McGill...")
        try:
            await conn.execute(
                """
                INSERT INTO campuses (id, name, domain, lat, lon)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    domain = EXCLUDED.domain,
                    lat = COALESCE(campuses.lat, EXCLUDED.lat),
                    lon = COALESCE(campuses.lon, EXCLUDED.lon)
                """,
                UUID(MCGILL_CAMPUS_ID),
                MCGILL_CAMPUS_NAME,
                MCGILL_CAMPUS_DOMAIN,
                MCGILL_LAT,
                MCGILL_LON,
            )
            print("Successfully seeded McGill!")
        except Exception as e:
            print(f"Failed to seed McGill: {e}")
            
        rows = await conn.fetch("SELECT id, name FROM campuses")
        print(f"Final campuses: {rows}")

    await pool.close()

if __name__ == "__main__":
    asyncio.run(main())
