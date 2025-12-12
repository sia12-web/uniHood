# Multi-University Support 🎓

This document describes the multi-university expansion implementation that allows the application to support multiple campuses beyond McGill.

## Architecture Overview

The application now supports multiple universities through a multi-tenant architecture:

### Backend
- ✅ Fully supports multi-tenancy
- ✅ `Campus` model with ID, name, and logo URL
- ✅ `listCampuses()` endpoint (`/auth/campuses`) to fetch available universities
- ✅ Discovery service filters content by user's `campus_id`

### Frontend
- ✅ Dynamic campus context via `CampusContext` provider
- ✅ `CampusLogoBadge` component accepts dynamic campus props
- ✅ University selection flow during onboarding
- ✅ Fallback to demo campus when needed

## Key Components

### 1. CampusContext (`contexts/CampusContext.tsx`)
Provides campus information throughout the app:
```tsx
import { useCampus, useCampusId } from '@/contexts/CampusContext';

function MyComponent() {
  const { campus, campusId, isLoading } = useCampus();
  // Or just get the ID:
  const campusId = useCampusId();
}
```

### 2. CampusLogoBadge (`components/CampusLogoBadge.tsx`)
Displays campus branding with fallback to generic initials:
```tsx
<CampusLogoBadge 
  campusName="McGill University" 
  logoUrl="/brand/mcgill.svg" 
/>
```

### 3. University Selection (`app/(onboarding)/select-university/page.tsx`)
New users select their university during onboarding. This page:
- Fetches available campuses from `/auth/campuses`
- Saves selection to user profile via `patchProfile`
- Redirects to next onboarding step

### 4. Identity Library (`lib/identity.ts`)
Provides API functions:
- `listCampuses()` - Get all available campuses
- `getCampusById(id)` - Get specific campus details
- `patchProfile()` - Update user's campus assignment

## User Flow

### New User Registration
1. User creates account at `/onboarding`
2. After email verification, user logs in
3. Login checks if user has `campus_id`
4. If not, redirects to `/select-university`
5. User selects their university
6. Campus saved to profile
7. User proceeds to complete onboarding

### Existing Users
- Campus ID stored in user profile
- Used throughout app: `authUser?.campusId ?? getDemoCampusId()`
- Campus-specific content filtered by backend

## Adding a New University

### 1. Database
Insert a new campus record:
```sql
INSERT INTO campuses (id, name, logo_url)
VALUES (
  gen_random_uuid(),
  'University of Toronto',
  'https://your-cdn.com/logos/uoft.svg'
);
```

### 2. Upload Logo
- Upload logo to S3 or your CDN
- Update `logo_url` in the campus record
- Logo should be square, SVG or PNG, min 256x256px

### 3. Test
1. Register a new user
2. Select the new university
3. Verify:
   - Badge shows correct name and logo
   - Discovery feed filters correctly
   - Profile displays campus correctly

## Testing

### Unit Tests
```bash
npm test campus-logo-badge.spec
```

Tests verify:
- ✅ Generic badge with initials when no logo
- ✅ Custom logo when URL provided
- ✅ Non-McGill universities display correctly

### Manual Testing
1. Create test campus in database
2. Register new user
3. Select test campus
4. Verify branding throughout app
5. Confirm discovery filtering works

## Migration Notes

The app maintains backward compatibility:
- `getDemoCampusId()` provides fallback for demo/dev environments
- Existing code using `getDemoCampusId()` continues to work
- No breaking changes to existing user flows

## Environment Variables

```env
# Optional: Override default campus for demo/testing
NEXT_PUBLIC_DEMO_CAMPUS_ID=c4f7d1ec-7b01-4f7b-a1cb-4ef0a1d57ae2
```

## Future Enhancements

Consider implementing:
- [ ] Campus-specific theming (colors, fonts)
- [ ] Campus-specific features/modules
- [ ] Inter-campus discovery (opt-in)
- [ ] Campus admin dashboard
- [ ] Campus analytics and insights
