"""Course management helpers."""

from __future__ import annotations

from typing import List
from uuid import UUID

from app.domain.identity import schemas
from app.infra.postgres import get_pool

MCGILL_CAMPUS_ID = "c4f7d1ec-7b01-4f7b-a1cb-4ef0a1d57ae2"
# Concordia campus ID - replace with actual UUID from your database
# To find it: SELECT id FROM campuses WHERE name LIKE '%Concordia%';
CONCORDIA_CAMPUS_ID = "concordia-uuid-placeholder"

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

from app.domain.campuses.service import CampusService

POPULAR_COURSES_CONCORDIA = [
    # Business / Commerce (JMSB)
    {"code": "COMM 210", "name": "Contemporary Business Thinking"},
    {"code": "COMM 215", "name": "Business Statistics"},
    {"code": "COMM 217", "name": "Financial Accounting"},
    {"code": "COMM 220", "name": "Analysis of Markets"},
    {"code": "COMM 225", "name": "Production and Operations Management"},
    {"code": "COMM 226", "name": "Business Technology Management"},
    {"code": "COMM 301", "name": "Management Information Systems"},
    {"code": "COMM 308", "name": "Introduction to Finance"},
    
    # Computer Science & Engineering
    {"code": "COMP 228", "name": "System Hardware"},
    {"code": "COMP 232", "name": "Mathematics for Computer Science"},
    {"code": "COMP 248", "name": "Object-Oriented Programming I"},
    {"code": "COMP 249", "name": "Object-Oriented Programming II"},
    {"code": "COMP 352", "name": "Data Structures and Algorithms"},
    {"code": "COMP 353", "name": "Databases"},
    {"code": "COMP 371", "name": "Computer Graphics"},
    {"code": "COMP 376", "name": "Introduction to Game Development"},

    # Economics
    {"code": "ECON 201", "name": "Introduction to Microeconomics"},
    {"code": "ECON 203", "name": "Introduction to Macroeconomics"},
    {"code": "ECON 221", "name": "Statistical Methods I"},
    {"code": "ECON 222", "name": "Statistical Methods II"},

    # Psychology
    {"code": "PSYC 200", "name": "Intro to Psychology"},
    {"code": "PSYC 201", "name": "Intro to Psychology"},
    {"code": "PSYC 203", "name": "Intro to Psychology"},

    # Biology
    {"code": "BIOL 201", "name": "Introductory Biology"},
    {"code": "BIOL 202", "name": "General Biology"},

    # Chemistry
    {"code": "CHEM 205", "name": "General Chemistry I"},
    {"code": "CHEM 206", "name": "General Chemistry II"},

    # Mathematics
    {"code": "MATH 203", "name": "Differential & Integral Calculus I"},
    {"code": "MATH 204", "name": "Vectors and Matrices"},
    {"code": "MATH 205", "name": "Differential & Integral Calculus II"},
    {"code": "MATH 206", "name": "Algebra and Functions"},

    # Film & Arts
    {"code": "FILM 201"},
    {"code": "FILM 202"},
    {"code": "FFAR 248"},
    {"code": "FFAR 249"},
    {"code": "AHSC 220"},

    # English
    {"code": "ENGL 212"},
    {"code": "ENGL 213"},

    # Political Science
    {"code": "POLI 203"},
    {"code": "POLI 204"},

    # Sociology
    {"code": "SOCI 203"},
    {"code": "SOCI 212"},

    # Other Sciences
    {"code": "PHYS 204", "name": "Mechanics"},

    # Linguistics & History
    {"code": "LING 200", "name": "Introduction to Language Study"},
    {"code": "HIST 203"},
]


async def get_popular_courses(campus_id: UUID) -> List[schemas.Course]:
    """Return popular courses for the campus."""
    campus_id_str = str(campus_id)
    
    if campus_id_str == MCGILL_CAMPUS_ID:
        return [schemas.Course(**c) for c in POPULAR_COURSES_MCGILL]
    
    # Check dynamically for Concordia if ID doesn't match known placeholder
    if campus_id_str == CONCORDIA_CAMPUS_ID:
        return [schemas.Course(**c) for c in POPULAR_COURSES_CONCORDIA]
        
    # Fallback to checking name if ID is not hardcoded
    campus = await CampusService().get_campus(campus_id)
    if campus and "Concordia" in campus["name"]:
        return [schemas.Course(**c) for c in POPULAR_COURSES_CONCORDIA]
    
    # For other campuses, return empty list for now
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

            # Deduplicate and normalize course codes
            seen = set()
            unique_codes = []
            for code in codes:
                normalized = code.strip().upper().replace("  ", " ")
                if normalized and normalized not in seen:
                    seen.add(normalized)
                    unique_codes.append(normalized)

            # Insert new courses (deduplicated)
            for code in unique_codes:
                await conn.execute(
                    """
                    INSERT INTO user_courses (user_id, course_code, visibility)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (user_id, course_code) DO NOTHING
                    """,
                    user_id,
                    code,
                    visibility,
                )
                
    return await get_user_courses(user_id)
