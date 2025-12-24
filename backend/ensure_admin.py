import asyncio
import os
import sys
import uuid
from argon2 import PasswordHasher

# Add parent dir to path if needed to find app
sys.path.append(os.getcwd())

from app.infra.postgres import init_pool, close_pool
from app.domain.identity.rbac import grant_role
from app.domain.identity.schemas import UserRoleGrantRequest
from app.infra.password import hash_password

TEST_EMAIL = "test@test.com"
TEST_PASSWORD = "test123"
ADMIN_ROLE_NAME = "admin"
ADMIN_ROLE_DESCRIPTION = "System administrator"

async def ensure_admin():
    from app.settings import settings
    print(f"Connecting to: {settings.postgres_url}")
    pool = await init_pool()
    try:
        async with pool.acquire() as conn:
            # 1. Ensure user exists
            user_row = await conn.fetchrow(
                "SELECT id FROM users WHERE email = $1",
                TEST_EMAIL,
            )
            
            if not user_row:
                user_id = uuid.uuid4()
                h = hash_password(TEST_PASSWORD)
                # Get a campus_id
                campus_id = await conn.fetchval("SELECT id FROM campuses LIMIT 1")
                import json
                await conn.execute(
                    """
                    INSERT INTO users (id, email, password_hash, email_verified, status, display_name, handle, campus_id, privacy)
                    VALUES ($1, $2, $3, TRUE, $4, $5, $6, $7, $8)
                    """,
                    user_id, TEST_EMAIL, h, json.dumps({}), "Test Admin", "testadmin", campus_id, json.dumps({})
                )
                print(f"Created user {TEST_EMAIL}")
            else:
                user_id = user_row["id"]
                # Ensure verified
                await conn.execute("UPDATE users SET email_verified = TRUE WHERE id = $1", user_id)
                print(f"User {TEST_EMAIL} already exists, ensured email_verified=TRUE")

            # 2. Ensure role exists
            role_id = await conn.fetchval(
                "SELECT id FROM roles WHERE name = $1",
                ADMIN_ROLE_NAME,
            )
            if not role_id:
                role_id = uuid.uuid4()
                await conn.execute(
                    "INSERT INTO roles (id, name, description) VALUES ($1, $2, $3)",
                    role_id,
                    ADMIN_ROLE_NAME,
                    ADMIN_ROLE_DESCRIPTION,
                )
                print(f"Created role '{ADMIN_ROLE_NAME}'")
            else:
                print(f"Role '{ADMIN_ROLE_NAME}' already exists")

            # 3. Grant role
            try:
                req = UserRoleGrantRequest(role_id=role_id)
                # We use the user themselves as the actor for this bootstrap script
                await grant_role(str(user_id), req, actor_id=str(user_id), campus_id=None)
                print(f"Granted '{ADMIN_ROLE_NAME}' role to {TEST_EMAIL}")
            except Exception as e:
                if "already has this role" in str(e).lower():
                    print(f"User {TEST_EMAIL} already has '{ADMIN_ROLE_NAME}' role")
                else:
                    print(f"Error granting role: {e}")

            print(f"\nFinal configuration for {TEST_EMAIL}:")
            print(f"Email: {TEST_EMAIL}")
            print(f"Password: {TEST_PASSWORD}")
            print(f"Verified: True")
            print(f"Role: {ADMIN_ROLE_NAME}")

    finally:
        await close_pool()

if __name__ == "__main__":
    asyncio.run(ensure_admin())
