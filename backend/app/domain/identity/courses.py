"""Course management helpers."""

from __future__ import annotations

from typing import List
from uuid import UUID

from app.domain.identity import schemas
from app.infra.postgres import get_pool

MCGILL_CAMPUS_ID = "c4f7d1ec-7b01-4f7b-a1cb-4ef0a1d57ae2"

POPULAR_COURSES_MCGILL = [
    # Freshman Science & Engineering Core (U0)
    {"code": "MATH 133", "name": "Linear Algebra and Geometry"},
    {"code": "MATH 140", "name": "Calculus 1"},
    {"code": "MATH 141", "name": "Calculus 2"},
    {"code": "BIOL 111", "name": "Principles: Organismal Biology"},
    {"code": "BIOL 112", "name": "Cell and Molecular Biology"},
    {"code": "CHEM 110", "name": "General Chemistry 1"},
    {"code": "CHEM 120", "name": "General Chemistry 2"},
    {"code": "PHYS 101", "name": "Introductory Physics – Mechanics"},
    {"code": "PHYS 102", "name": "Introductory Physics – Electromagnetism"},
    {"code": "PHYS 131", "name": "Mechanics and Waves"},
    {"code": "PHYS 142", "name": "Electromagnetism and Optics"},

    # Freshman Management Core (U0/U1)
    {"code": "MATH 122", "name": "Calculus for Management"},
    {"code": "MATH 123", "name": "Linear Algebra and Probability"},
    {"code": "MGCR 211", "name": "Introduction to Financial Accounting"},
    {"code": "MGCR 222", "name": "Introduction to Organizational Behaviour"},
    {"code": "ECON 208", "name": "Microeconomic Analysis and Applications"},
    {"code": "ECON 209", "name": "Macroeconomic Analysis and Applications"},

    # Popular Electives & "Bird Courses"
    {"code": "CHEM 181", "name": "World of Chemistry: Food"},
    {"code": "ATOC 185", "name": "Natural Disasters"},
    {"code": "ATOC 184", "name": "Science of Storms"},
    {"code": "PHYS 183", "name": "The Milky Way Inside and Out"},
    {"code": "MUAR 211", "name": "The Art of Listening"},
    {"code": "COMP 202", "name": "Foundations of Programming"},
    {"code": "PSYC 100", "name": "Introduction to Psychology"},
    {"code": "ANTH 202", "name": "Socio-Cultural Anthropology"},
    {"code": "RELG 204", "name": "Judaism, Christianity and Islam"},
    {"code": "CLAS 203", "name": "Greek Mythology"},
    {"code": "EPSY 202", "name": "Science of Education"},
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
