#!/usr/bin/env node
/**
 * Performance Page Inventory Generator
 * 
 * Reads Next.js route manifests and generates a complete list of URLs
 * for Lighthouse CI testing. Classifies routes by category and auth requirement.
 * 
 * Usage:
 *   node scripts/perf-inventory.js [--json] [--urls-only] [--category=public]
 * 
 * Output:
 *   - perf-results/page-inventory.json (full inventory with metadata)
 *   - perf-results/lighthouse-urls.txt (URLs only, for LHCI)
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION: Define test data IDs for dynamic routes
// These should match seeded data in your test database
// ============================================================================
const PERF_TEST_DATA = {
  // User profiles - use a stable test user
  handle: 'perf-test-user',
  userId: '01HPERFTEST000000000000001',
  
  // Chat - a test conversation
  peerid: '01HPERFTEST000000000000002',
  
  // Meetups - a stable test meetup
  meetupId: '01HPERFTEST000000000000003',
  
  // Rooms - a test room
  roomId: '01HPERFTEST000000000000004',
  
  // Communities
  groupId: '01HPERFTEST000000000000005',
  eventId: '01HPERFTEST000000000000006',
  
  // Moderation (admin)
  caseId: '01HPERFTEST000000000000007',
  attachmentId: '01HPERFTEST000000000000008',
  queueKey: 'default',
  
  // Verification token (for /verify/[token])
  token: 'perf-test-token-placeholder',
};

// ============================================================================
// ROUTE CLASSIFICATION
// ============================================================================
const ROUTE_CATEGORIES = {
  public: [
    '/',
    '/login',
    '/join',
    '/forgot-password',
    '/forgot-username',
    '/reset-password',
    '/features',
    '/contact',
    '/terms',
    '/privacy',
    '/verify-email',
  ],
  
  onboarding: [
    '/onboarding',
    '/onboarding/courses',
    '/welcome',
    '/select-university',
    '/select-courses',
    '/set-profile',
    '/major-year',
    '/photos',
    '/passions',
  ],
  
  authenticated: [
    '/discovery',
    '/search',
    '/me',
    '/profiles',
    '/meetups',
    '/chat',
    '/rooms',
    '/rooms/create',
    '/rooms/join',
    '/friends',
    '/invites',
    '/match',
    '/social',
    '/social/friends',
    '/social/invitations',
    '/social/nearby',
    '/communities',
    '/communities/feed',
    '/communities/events',
    '/communities/groups',
    '/communities/notifications',
    '/communities/search',
    '/leaderboards',
    '/verify',
  ],
  
  settings: [
    '/settings/account',
    '/settings/accounts',
    '/settings/consent',
    '/settings/contact-discovery',
    '/settings/education',
    '/settings/interests',
    '/settings/links',
    '/settings/notifications',
    '/settings/passkeys',
    '/settings/privacy',
    '/settings/profile',
    '/settings/security',
    '/settings/sessions',
    '/settings/skills',
    '/settings/verification',
  ],
  
  activities: [
    '/activities/quick_trivia',
    '/activities/rock_paper_scissors',
    '/activities/speed_typing',
    '/activities/story',
    '/activities/tictactoe',
  ],
  
  admin: [
    '/admin',
    '/admin/consent',
    '/admin/contact',
    '/admin/flags',
    '/admin/rbac',
    '/admin/verification',
    '/admin/mod',
    '/admin/mod/audit',
    '/admin/mod/cases',
    '/admin/mod/jobs',
    '/admin/mod/quarantine',
    '/admin/mod/safety/hashes',
    '/admin/mod/safety/hashes/import',
    '/admin/mod/safety/thresholds',
    '/admin/mod/safety/urls',
    '/admin/mod/tools',
    '/admin/mod/tools/bundles',
    '/admin/mod/tools/catalog',
    '/admin/mod/tools/jobs',
    '/admin/mod/tools/macro',
    '/admin/mod/tools/macros',
    '/admin/mod/tools/revert',
    '/admin/mod/tools/unshadow',
    '/admin/mod/triage',
  ],
};

// Dynamic routes that need ID substitution
const DYNAMIC_ROUTE_MAP = {
  '/u/[handle]': `/u/${PERF_TEST_DATA.handle}`,
  '/chat/[peerid]': `/chat/${PERF_TEST_DATA.peerid}`,
  '/meetups/[id]': `/meetups/${PERF_TEST_DATA.meetupId}`,
  '/rooms/[roomId]': `/rooms/${PERF_TEST_DATA.roomId}`,
  '/communities/groups/[groupId]': `/communities/groups/${PERF_TEST_DATA.groupId}`,
  '/communities/groups/[groupId]/about': `/communities/groups/${PERF_TEST_DATA.groupId}/about`,
  '/communities/groups/[groupId]/events': `/communities/groups/${PERF_TEST_DATA.groupId}/events`,
  '/communities/groups/[groupId]/members': `/communities/groups/${PERF_TEST_DATA.groupId}/members`,
  '/communities/groups/[groupId]/settings': `/communities/groups/${PERF_TEST_DATA.groupId}/settings`,
  '/communities/events/[eventId]': `/communities/events/${PERF_TEST_DATA.eventId}`,
  '/verify/[token]': `/verify/${PERF_TEST_DATA.token}`,
  // Admin dynamic routes
  '/admin/mod/cases/[caseId]': `/admin/mod/cases/${PERF_TEST_DATA.caseId}`,
  '/admin/mod/cases/[caseId]/appeal': `/admin/mod/cases/${PERF_TEST_DATA.caseId}/appeal`,
  '/admin/mod/cases/[caseId]/timeline': `/admin/mod/cases/${PERF_TEST_DATA.caseId}/timeline`,
  '/admin/mod/quarantine/[attachmentId]': `/admin/mod/quarantine/${PERF_TEST_DATA.attachmentId}`,
  '/admin/mod/triage/[queueKey]': `/admin/mod/triage/${PERF_TEST_DATA.queueKey}`,
  '/admin/mod/users/[userId]': `/admin/mod/users/${PERF_TEST_DATA.userId}`,
  '/admin/mod/users/[userId]/linkage': `/admin/mod/users/${PERF_TEST_DATA.userId}/linkage`,
};

// Routes to skip (API routes, internal routes)
const SKIP_ROUTES = [
  '/api/',
  '/_not-found',
  '/_harness',
];

// ============================================================================
// MAIN LOGIC
// ============================================================================

function loadRouteManifest() {
  const manifestPath = path.join(__dirname, '../.next/app-path-routes-manifest.json');
  
  if (!fs.existsSync(manifestPath)) {
    console.error('❌ Route manifest not found. Run `npm run build` first.');
    process.exit(1);
  }
  
  return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
}

function categorizeRoute(route) {
  for (const [category, routes] of Object.entries(ROUTE_CATEGORIES)) {
    if (routes.includes(route)) {
      return category;
    }
  }
  
  // Infer category from path
  if (route.startsWith('/admin')) return 'admin';
  if (route.startsWith('/settings')) return 'settings';
  if (route.startsWith('/activities')) return 'activities';
  if (route.startsWith('/onboarding') || route.startsWith('/welcome') || route.startsWith('/select-')) return 'onboarding';
  if (route.startsWith('/communities')) return 'authenticated';
  
  return 'authenticated'; // Default to authenticated
}

function resolveRoute(route) {
  // Check if it's a dynamic route
  if (route.includes('[')) {
    const resolved = DYNAMIC_ROUTE_MAP[route];
    if (resolved) {
      return { url: resolved, isDynamic: true, pattern: route };
    }
    // Unknown dynamic route - skip it
    return null;
  }
  return { url: route, isDynamic: false, pattern: route };
}

function shouldSkipRoute(route) {
  return SKIP_ROUTES.some(skip => route.includes(skip));
}

function generateInventory() {
  const manifest = loadRouteManifest();
  const inventory = {
    generated: new Date().toISOString(),
    testData: PERF_TEST_DATA,
    pages: [],
    summary: {
      total: 0,
      byCategory: {},
      byAuth: { public: 0, authenticated: 0 },
      dynamic: 0,
      static: 0,
    },
  };
  
  // Extract routes from manifest
  const routes = Object.values(manifest).filter(route => !shouldSkipRoute(route));
  
  for (const route of routes) {
    const resolved = resolveRoute(route);
    if (!resolved) continue;
    
    const category = categorizeRoute(route);
    const requiresAuth = !['public'].includes(category);
    
    const page = {
      pattern: resolved.pattern,
      url: resolved.url,
      category,
      requiresAuth,
      isDynamic: resolved.isDynamic,
    };
    
    inventory.pages.push(page);
    
    // Update summary
    inventory.summary.total++;
    inventory.summary.byCategory[category] = (inventory.summary.byCategory[category] || 0) + 1;
    inventory.summary.byAuth[requiresAuth ? 'authenticated' : 'public']++;
    if (resolved.isDynamic) inventory.summary.dynamic++;
    else inventory.summary.static++;
  }
  
  // Sort pages by category then URL
  inventory.pages.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.url.localeCompare(b.url);
  });
  
  return inventory;
}

function generateLighthouseUrls(inventory, baseUrl = 'http://localhost:3000', options = {}) {
  const { category, authOnly, publicOnly } = options;
  
  let pages = inventory.pages;
  
  if (category) {
    pages = pages.filter(p => p.category === category);
  }
  if (authOnly) {
    pages = pages.filter(p => p.requiresAuth);
  }
  if (publicOnly) {
    pages = pages.filter(p => !p.requiresAuth);
  }
  
  return pages.map(p => `${baseUrl}${p.url}`);
}

function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const urlsOnly = args.includes('--urls-only');
  const categoryArg = args.find(a => a.startsWith('--category='));
  const category = categoryArg ? categoryArg.split('=')[1] : null;
  const publicOnly = args.includes('--public');
  const authOnly = args.includes('--auth');
  
  const inventory = generateInventory();
  
  // Ensure output directory exists
  const outputDir = path.join(__dirname, '../perf-results');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Write full inventory
  const inventoryPath = path.join(outputDir, 'page-inventory.json');
  fs.writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2));
  
  // Generate URLs
  const urls = generateLighthouseUrls(inventory, 'http://localhost:3000', {
    category,
    publicOnly,
    authOnly,
  });
  
  // Write URLs file for Lighthouse
  const urlsPath = path.join(outputDir, 'lighthouse-urls.txt');
  fs.writeFileSync(urlsPath, urls.join('\n'));
  
  // Write public-only URLs (for unauthenticated runs)
  const publicUrls = generateLighthouseUrls(inventory, 'http://localhost:3000', { publicOnly: true });
  const publicUrlsPath = path.join(outputDir, 'lighthouse-urls-public.txt');
  fs.writeFileSync(publicUrlsPath, publicUrls.join('\n'));
  
  // Console output
  if (jsonOutput) {
    console.log(JSON.stringify(inventory, null, 2));
  } else if (urlsOnly) {
    console.log(urls.join('\n'));
  } else {
    console.log('\n📊 Performance Page Inventory Generated\n');
    console.log(`Total pages: ${inventory.summary.total}`);
    console.log(`  Static: ${inventory.summary.static}`);
    console.log(`  Dynamic: ${inventory.summary.dynamic}`);
    console.log(`  Public: ${inventory.summary.byAuth.public}`);
    console.log(`  Auth required: ${inventory.summary.byAuth.authenticated}`);
    console.log('\nBy category:');
    for (const [cat, count] of Object.entries(inventory.summary.byCategory).sort()) {
      console.log(`  ${cat}: ${count}`);
    }
    console.log(`\nOutput files:`);
    console.log(`  ${inventoryPath}`);
    console.log(`  ${urlsPath}`);
    console.log(`  ${publicUrlsPath}`);
  }
}

// Export for use in other scripts
module.exports = {
  generateInventory,
  generateLighthouseUrls,
  PERF_TEST_DATA,
  ROUTE_CATEGORIES,
};

if (require.main === module) {
  main();
}
