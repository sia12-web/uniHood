"""Course management helpers."""

from __future__ import annotations

from typing import List
from uuid import UUID

from app.domain.identity import schemas
from app.infra.postgres import get_pool

MCGILL_CAMPUS_ID = "c4f7d1ec-7b01-4f7b-a1cb-4ef0a1d57ae2"

POPULAR_COURSES_MCGILL = [
    {"code": "COMP 202", "name": "Foundations of Programming"},
    {"code": "COMP 250", "name": "Introduction to Computer Science"},
    {"code": "MATH 133", "name": "Linear Algebra and Geometry"},
    {"code": "MATH 140", "name": "Calculus 1"},
    {"code": "PSYC 100", "name": "Introduction to Psychology"},
    {"code": "ECON 208", "name": "Microeconomic Analysis and Applications"},
    {"code": "MGCR 211", "name": "Introduction to Financial Accounting"},
    {"code": "BIOL 111", "name": "Principles: Organismal Biology"},
    {"code": "CHEM 110", "name": "General Chemistry 1"},
    {"code": "PHYS 101", "name": "Introductory Physics - Mechanics"},
]


async def get_popular_courses(campus_id: UUID) -> List[schemas.Course]:
    """Return popular courses for the campus."""
    # For MVP, we only have static data for McGill.
    if str(campus_id) == MCGILL_CAMPUS_ID:
        return [schemas.Course(**c) for c in POPULAR_COURSES_MCGILL]
    return []


async def get_user_courses(user_id: UUID) -> List[schemas.UserCourse]:
    """Return the courses for the given user."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT course_code, visibility, created_at
            FROM user_courses
            WHERE user_id = $1
            ORDER BY course_code ASC
            """,
            user_id,
        )
    return [
        schemas.UserCourse(
            code=row["course_code"],
            visibility=row["visibility"],
            created_at=row["created_at"],
        )
        for row in rows
    ]


async def set_user_courses(user_id: UUID, codes: List[str], visibility: str) -> List[schemas.UserCourse]:
    """Bulk set the user's courses."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Delete existing courses
            await conn.execute(
                """
                DELETE FROM user_courses
                WHERE user_id = $1
                """,
                user_id,
            )
            
            if not codes:
                return []

            # Insert new courses
            for code in codes:
                await conn.execute(
                    """
                    INSERT INTO user_courses (user_id, course_code, visibility)
                    VALUES ($1, $2, $3)
                    """,
                    user_id,
                    code,
                    visibility,
                )
                
    return await get_user_courses(user_id)
