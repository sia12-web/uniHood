# Concordia University Course Integration

## ✅ What's Been Added

Concordia University popular courses have been added to the course selection system. The following courses are now available for Concordia students:

### Freshman Science & Engineering Core
- MATH 203 – Differential & Integral Calculus I  
- MATH 204 – Vectors and Matrices
- MATH 205 – Differential & Integral Calculus II
- PHYS 204 – Mechanics
- PHYS 205 – Electricity and Magnetism
- PHYS 206 – Waves and Modern Physics
- CHEM 205 – General Chemistry I
- CHEM 206 – General Chemistry II
- BIOL 201 – Introductory Biology

### Freshman Business Core (JMSB Foundation)
- MATH 208 – Fundamental Mathematics I (Linear Algebra for Business)
- MATH 209 – Fundamental Mathematics II (Calculus for Business)
- ECON 201 – Introduction to Microeconomics
- ECON 203 – Introduction to Macroeconomics
- BTM 200 – Fundamentals of Information Technology

### Popular Electives & "Bird Courses"
- PHYS 284 – Introduction to Astronomy
- INST 250 – Information Literacy Skills
- THEO 202 – Introduction to Biblical Studies
- THEO 204 – Introduction to Christian Ethics
- EXCI 251 – Health and Physical Activity
- EXCI 202 – The Body Human
- MARK 201 – Introduction to Marketing
- LING 200 – Introduction to Language Study
- EDUC 240 – Training and Development
- CLAS 260 – Greek Mythology

## 🔧 Setup Required

### Step 1: Add Concordia to Database (if not already done)

First, check if Concordia exists in your database:

```sql
SELECT id, name FROM campuses WHERE name LIKE '%Concordia%';
```

If Concordia doesn't exist, add it:

```sql
INSERT INTO campuses (id, name)
VALUES (
  gen_random_uuid(),
  'Concordia University'
);
```


### Step 2: Update the Campus ID in Code

After adding/finding Concordia in the database, update the `CONCORDIA_CAMPUS_ID` constant:

**File**: `backend/app/domain/identity/courses.py`

**Line 14**: Replace the placeholder with the actual UUID:

```python
# Before:
CONCORDIA_CAMPUS_ID = "concordia-uuid-placeholder"

# After (example):
CONCORDIA_CAMPUS_ID = "a1b2c3d4-e5f6-7g8h-9i0j-k1l2m3n4o5p6"
```

To get the UUID, run:

```sql
SELECT id FROM campuses WHERE name LIKE '%Concordia%';
```

### Step 3: Restart Backend

After updating the constant, restart your backend server:

```bash
# If using Docker:
docker-compose restart backend

# If running locally:
# Stop the server (Ctrl+C) and restart it
```

## ✅ Verification

1. **Create a test user** or use an existing Concordia student account
2. **Select Concordia** as the campus during onboarding
3. **Navigate to course selection** (`/select-courses`)
4**Verify** that you see all 29 Concordia courses in the "Popular at your university" section

## 📝 How It Works

### Backend Logic

The `get_popular_courses()` function in `backend/app/domain/identity/courses.py` now checks the campus ID:

```python
if campus_id_str == MCGILL_CAMPUS_ID:
    return [schemas.Course(**c) for c in POPULAR_COURSES_MCGILL]
elif campus_id_str == CONCORDIA_CAMPUS_ID:
    return [schemas.Course(**c) for c in POPULAR_COURSES_CONCORDIA]
else:
    return []  # Empty for other campuses
```

### Frontend Integration

The frontend automatically calls `/universities/{campus_id}/popular-courses` when users reach the course selection page:

1. User selects Concordia during onboarding
2. `campus_id` is saved to their profile
3. On `/select-courses`, the frontend loads courses via `fetchPopularCourses(profile.campus_id)`
4. Backend returns Concordia-specific courses
5. Courses display in the UI

## 🎯 Adding More Universities

To add courses for other universities (e.g., UofT, UBC):

1. **Add university to database** (if not already there)
2. **Add constant** in `courses.py`:
   ```python
   UOFT_CAMPUS_ID = "uuid-here"
   ```
3. **Create course list**:
   ```python
   POPULAR_COURSES_UOFT = [
       {"code": "MAT137", "name": "Calculus"},
       # ... more courses
   ]
   ```
4. **Update function**:
   ```python
   elif campus_id_str == UOFT_CAMPUS_ID:
       return [schemas.Course(**c) for c in POPULAR_COURSES_UOFT]
   ```

## 🐛 Troubleshooting

### No courses showing for Concordia students

**Check:**
- ✅ Is Concordia in the database?
- ✅ Is `CONCORDIA_CAMPUS_ID` updated with the correct UUID?
- ✅ Has the backend been restarted after the change?
- ✅ Does the user's profile have `campus_id` set to Concordia?

**Debug query:**
```sql
-- Check user's campus
SELECT u.id, u.email, p.campus_id, c.name as campus_name
FROM users u
JOIN profiles p ON u.id = p.user_id
LEFT JOIN campuses c ON p.campus_id = c.id
WHERE u.email = 'student@concordia.ca';
```

### Students seeing wrong courses

**Verify the campus ID matches:**
```python
# In courses.py, add temporary logging
print(f"Requested campus: {campus_id_str}")
print(f"Concordia ID: {CONCORDIA_CAMPUS_ID}")
print(f"Match: {campus_id_str == CONCORDIA_CAMPUS_ID}")
```

## 📚 Course Data Source

The Concordia courses were provided based on:
- Freshman Science/Engineering Core (equivalent to McGill's courses)
- JMSB Business Foundation courses
- Popular electives and "bird courses" (easy GPA boosters)

Courses can be updated/modified in `POPULAR_COURSES_CONCORDIA` list as needed.

---

**Status**: ✅ Implementation Complete (pending campus ID update)

**Files Modified**: 
- `backend/app/domain/identity/courses.py` ✅

**Next Steps**:
1. Get Concordia UUID from database
2. Update `CONCORDIA_CAMPUS_ID` constant in `backend/app/domain/identity/courses.py`
3. Restart backend
4. Test with Concordia student account
