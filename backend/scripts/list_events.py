import asyncpg
import asyncio

async def main():
    conn = await asyncpg.connect('postgresql://postgres:postgres@127.0.0.1:5432/unihood')
    rows = await conn.fetch('SELECT DISTINCT event FROM audit_log')
    print([r[0] for r in rows])
    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
