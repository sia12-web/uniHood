# Changelog - Performance Optimizations (December 13, 2025)

## Backend (Activities Core Service)

### Session Memory Management
- **quickTrivia.ts**: Added session cleanup interval (5 min) with TTL-based removal
- **storyBuilder.ts**: Added session cleanup interval (5 min) with TTL-based removal  
- **tictactoe.ts**: Added session cleanup interval (5 min) with TTL-based removal
- **index.ts**: Enhanced generic session cleanup for RPS and Speed Typing

### Algorithm Improvements
- **quickTrivia.ts**: Optimized `pickQuestions` from O(N log N) to O(K) using Fisher-Yates partial shuffle

### Error Handling
- **quickTrivia.ts**: Wrapped `recordGameResult` in try-catch
- **storyBuilder.ts**: Wrapped `recordGameResult` in try-catch
- **tictactoe.ts**: Wrapped all `recordGameResult` calls in try-catch

---

## Frontend

### API Client (`app/lib/http/client.ts`)
- Added in-flight request deduplication for GET requests
- Added response caching with configurable TTL (default 5 seconds)
- Added `invalidateCache(urlPattern)` and `clearCache()` utilities
- New options: `cacheTtl?: number`, `skipDedup?: boolean`

### Chat Layout (`app/(chat)/chat/layout.tsx`)
- Created memoized `ChatRosterItem` component with `React.memo`
- Added `useCallback` for `handleSelectConversation` and `handleOpenMenu`
- Replaced inline list rendering with memoized component

### Friends Page (`app/(social)/friends/page.tsx`)
- Created memoized `FriendCard` component with `React.memo`
- Added `useCallback` for `handleToggleMenu`
- Replaced inline list rendering with memoized component

### Onboarding Pages

#### Photos Page (`app/(onboarding)/photos/page.tsx`)
- Dynamic import for `PhotoAdjuster` with loading skeleton
- Dynamic import for `AvatarCreator` with loading skeleton
- Replaced `<img>` with Next.js `<Image>` for avatar
- Added skeleton loading state

#### Set Profile Page (`app/(onboarding)/set-profile/page.tsx`)
- Added skeleton loading state with form field placeholders

#### Passions Page (`app/(onboarding)/passions/page.tsx`)
- Added skeleton loading state with chips placeholders

#### Select University Page (`app/(onboarding)/select-university/page.tsx`)
- Added skeleton loading state with dropdown placeholder

#### Major Year Page (`app/(onboarding)/major-year/page.tsx`)
- Added skeleton loading state with form field placeholders

#### Select Courses Page (`app/(onboarding)/select-courses/page.tsx`)
- Added skeleton loading state with search and chips placeholders

---

## Files Modified Summary

| File | Changes |
|------|---------|
| `services/activities-core/src/ws/quickTrivia.ts` | Session cleanup, algorithm, error handling |
| `services/activities-core/src/ws/storyBuilder.ts` | Session cleanup, error handling |
| `services/activities-core/src/ws/tictactoe.ts` | Session cleanup, error handling |
| `services/activities-core/src/index.ts` | Enhanced cleanup, interval start |
| `frontend/app/lib/http/client.ts` | Deduplication, caching |
| `frontend/app/(chat)/chat/layout.tsx` | Memoized ChatRosterItem |
| `frontend/app/(social)/friends/page.tsx` | Memoized FriendCard |
| `frontend/app/(onboarding)/photos/page.tsx` | Dynamic imports, Image, skeleton |
| `frontend/app/(onboarding)/set-profile/page.tsx` | Skeleton loading |
| `frontend/app/(onboarding)/passions/page.tsx` | Skeleton loading |
| `frontend/app/(onboarding)/select-university/page.tsx` | Skeleton loading |
| `frontend/app/(onboarding)/major-year/page.tsx` | Skeleton loading |
| `frontend/app/(onboarding)/select-courses/page.tsx` | Skeleton loading |

---

## Documentation Created

- `docs/PERFORMANCE_OPTIMIZATIONS.md` - Comprehensive documentation of all optimizations
- `docs/CHANGELOG_PERFORMANCE.md` - This changelog file

---

## Testing Recommendations

1. **Backend Session Cleanup**
   - Run activities service for extended period
   - Verify memory usage stays stable
   - Create and end sessions, confirm cleanup after TTL

2. **API Caching**
   - Open Network tab in DevTools
   - Navigate to pages with data fetching
   - Verify duplicate requests are deduplicated
   - Verify cached responses return instantly

3. **React Memoization**
   - Install React DevTools
   - Enable "Highlight updates when components render"
   - Open chat and observe only affected items re-render
   - Open friends list and toggle menus

4. **Onboarding**
   - Navigate through onboarding flow
   - Verify skeleton states appear during loading
   - Verify no layout shift when content loads
