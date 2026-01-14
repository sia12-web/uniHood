import asyncio
import os
import sys
import uuid

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.append(BACKEND_DIR)

from app.infra.postgres import init_pool, close_pool
from app.domain.identity.rbac import grant_role
from app.domain.identity.schemas import UserRoleGrantRequest

TEST_EMAIL = "test@test.com"
ADMIN_ROLE_NAME = "admin"
ADMIN_ROLE_DESCRIPTION = "System administrator"


async def promote() -> None:
    pool = await init_pool()
    try:
        async with pool.acquire() as conn:
            user_row = await conn.fetchrow(
                "SELECT id, email_verified FROM users WHERE email = $1",
                TEST_EMAIL,
            )
            if not user_row:
                print(f"ERROR: User {TEST_EMAIL} not found. Register it first.")
                return
            user_id = user_row["id"]
            if not user_row.get("email_verified", False):
                await conn.execute(
                    "UPDATE users SET email_verified = TRUE WHERE id = $1",
                    user_id,
                )
                print(f"Marked {TEST_EMAIL} as email verified.")

            # Ensure 'admin' role
            role_id = await conn.fetchval("SELECT id FROM roles WHERE name = $1", ADMIN_ROLE_NAME)
            if not role_id:
                role_id = uuid.uuid4()
                await conn.execute(
                    "INSERT INTO roles (id, name, description) VALUES ($1, $2, $3)",
                    role_id, ADMIN_ROLE_NAME, ADMIN_ROLE_DESCRIPTION,
                )
                print(f"Created role '{ADMIN_ROLE_NAME}'.")
            
            await grant_role(str(user_id), UserRoleGrantRequest(role_id=role_id), actor_id=str(user_id))
            print(f"Granted '{ADMIN_ROLE_NAME}' role to {TEST_EMAIL}.")

            # Ensure 'staff.admin' role for moderation
            staff_role_id = await conn.fetchval("SELECT id FROM roles WHERE name = $1", "staff.admin")
            if not staff_role_id:
                staff_role_id = uuid.uuid4()
                await conn.execute(
                    "INSERT INTO roles (id, name, description) VALUES ($1, $2, $3)",
                    staff_role_id, "staff.admin", "Moderation Administrator",
                )
                print("Created role 'staff.admin'.")
            
            await grant_role(str(user_id), UserRoleGrantRequest(role_id=staff_role_id), actor_id=str(user_id))
            print(f"Granted 'staff.admin' role to {TEST_EMAIL}.")

            print(f"Success: {TEST_EMAIL} is now fully provisioned as admin.")
    finally:
        await close_pool()


if __name__ == "__main__":
    asyncio.run(promote())
