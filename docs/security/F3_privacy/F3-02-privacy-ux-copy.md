# F3-02: Privacy UX & Copy Guidelines

> Status: 📋 **New** — Defines clear, user-friendly privacy communication

## Goals

- Ensure all privacy-related UI text is clear and non-technical
- Help users understand what they're sharing and with whom
- Reduce user anxiety about data handling

## Principles

### 1. Plain Language

| ❌ Don't | ✅ Do |
|----------|-------|
| "Geolocation data is transmitted to our servers" | "We use your location to show you who's nearby" |
| "Your PII will be processed according to our policy" | "Your personal info stays private unless you choose to share it" |
| "Disable proximity beacon" | "Stop sharing my location" |

### 2. Clear Consequences

Always explain what happens when a setting is on vs. off:

```
"What happens if I turn this off?"
```

### 3. Contextual Help

Show help text inline, not hidden in documentation.

## Privacy Control Copy

### Discoverability Settings

#### Master Toggle
```
┌────────────────────────────────────────────────────────┐
│ Make my profile discoverable                       [ON]│
│                                                        │
│ When ON: Other students can find you in search,       │
│ nearby, and suggestions.                               │
│                                                        │
│ When OFF: Your profile is hidden from everyone        │
│ except people you've already connected with.          │
└────────────────────────────────────────────────────────┘
```

#### Search Visibility
```
┌────────────────────────────────────────────────────────┐
│ Appear in search results                          [ON] │
│                                                        │
│ Others can find your profile by searching your        │
│ name or username.                                      │
│                                                        │
│ ℹ️ Turning this off won't affect existing connections │
└────────────────────────────────────────────────────────┘
```

#### Nearby Visibility
```
┌────────────────────────────────────────────────────────┐
│ Show me in "Nearby"                               [ON] │
│                                                        │
│ People near you on campus can see that you're         │
│ around. You'll see them too.                          │
│                                                        │
│ 🔒 Your exact location is never shared—only that      │
│    you're within a certain distance.                  │
└────────────────────────────────────────────────────────┘
```

### Location/Proximity Settings

#### Location Sharing
```
┌────────────────────────────────────────────────────────┐
│ Enable location features                          [ON] │
│                                                        │
│ See who's nearby and let others know you're around.   │
│                                                        │
│ What we share:                                         │
│ • Approximate distance (e.g., "200m away")            │
│ • Campus building (if enabled)                         │
│                                                        │
│ What we NEVER share:                                   │
│ • Your exact coordinates                               │
│ • Your location history                                │
│ • Location when you're off campus                      │
└────────────────────────────────────────────────────────┘
```

#### Distance Precision
```
┌────────────────────────────────────────────────────────┐
│ Distance precision                                     │
│                                                        │
│ How precisely should others see your distance?        │
│                                                        │
│ ○ Exact                                                │
│   "150m away"                                          │
│   Best for meeting up                                  │
│                                                        │
│ ● Approximate (recommended)                            │
│   "Within 500m"                                        │
│   Balanced privacy                                     │
│                                                        │
│ ○ Zone only                                            │
│   "On campus" or "Nearby"                              │
│   Maximum privacy                                      │
└────────────────────────────────────────────────────────┘
```

### Data Export

```
┌────────────────────────────────────────────────────────┐
│ Download your data                                     │
│                                                        │
│ Get a copy of everything you've shared on Divan:      │
│ • Profile information                                  │
│ • Messages you've sent                                 │
│ • Posts and comments                                   │
│ • Photos you've uploaded                               │
│ • Events you've created or attended                    │
│                                                        │
│ We'll email you when your download is ready           │
│ (usually within 24 hours).                             │
│                                                        │
│                              [Request Download]        │
│                                                        │
│ ℹ️ Your download link expires after 48 hours          │
└────────────────────────────────────────────────────────┘
```

### Account Deletion

```
┌────────────────────────────────────────────────────────┐
│ Delete your account                                    │
│                                                        │
│ ⚠️ This will permanently delete:                       │
│ • Your profile and all settings                        │
│ • All messages you've sent                             │
│ • All posts and comments                               │
│ • All photos and files                                 │
│ • Your event history                                   │
│                                                        │
│ This action cannot be undone.                          │
│                                                        │
│ You'll have 14 days to change your mind.              │
│ After that, your data is permanently removed.         │
│                                                        │
│           [Cancel]  [Delete My Account]                │
└────────────────────────────────────────────────────────┘
```

#### Confirmation Dialog
```
┌────────────────────────────────────────────────────────┐
│ Are you sure?                                          │
│                                                        │
│ We've sent a confirmation link to your email.         │
│                                                        │
│ Click the link to confirm account deletion.           │
│ The link expires in 24 hours.                          │
│                                                        │
│ Changed your mind? Just ignore the email and your     │
│ account will stay active.                              │
│                                                        │
│                                            [Got it]    │
└────────────────────────────────────────────────────────┘
```

### Blocking Users

```
┌────────────────────────────────────────────────────────┐
│ Block @username?                                       │
│                                                        │
│ When you block someone:                                │
│ • They can't message you                               │
│ • They can't see your profile                          │
│ • They won't see you in Nearby                         │
│ • You won't see them anywhere                          │
│                                                        │
│ They won't be notified that you blocked them.         │
│                                                        │
│           [Cancel]  [Block]                            │
└────────────────────────────────────────────────────────┘
```

## Error & Status Messages

### Export Status

| State | Message |
|-------|---------|
| Pending | "We're preparing your download. This usually takes a few minutes." |
| Ready | "Your download is ready! The link expires in 48 hours." |
| Expired | "This download link has expired. Request a new export." |
| Failed | "Something went wrong. Please try again or contact support." |

### Deletion Status

| State | Message |
|-------|---------|
| Pending confirmation | "Check your email to confirm account deletion." |
| Grace period | "Your account will be deleted on [DATE]. Changed your mind? [Cancel deletion]" |
| Processing | "Your account is being deleted. This may take a few minutes." |
| Complete | "Your account has been deleted. Thank you for using Divan." |

## Tooltips & Help Text

### Privacy Icons

| Icon | Meaning | Tooltip |
|------|---------|---------|
| 🔒 | Private/Secure | "This information is private" |
| 👁️ | Visible to others | "Others can see this" |
| 🌐 | Public | "Anyone can see this" |
| 👥 | Friends only | "Only your connections can see this" |
| 📍 | Location-related | "Uses your location" |

### Common Questions (inline)

```
┌────────────────────────────────────────────────────────┐
│ ❓ Why do you need my location?                        │
│                                                        │
│ Location helps you discover students nearby on        │
│ campus. We only use it when the app is open, and     │
│ we never track you off campus or store your          │
│ location history.                                      │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ ❓ Who can see my profile?                             │
│                                                        │
│ Only students at your campus can see your profile.   │
│ Your profile is never visible to people outside      │
│ the Divan community.                                   │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ ❓ What happens to my data if I delete my account?    │
│                                                        │
│ Your data is permanently removed from our servers     │
│ within 30 days. We keep minimal records only as      │
│ required by law.                                       │
└────────────────────────────────────────────────────────┘
```

## Notification Copy

### Privacy-Related Emails

#### Export Ready
```
Subject: Your Divan data is ready to download

Hi [Name],

Your data export is ready!

[Download My Data]

This link will expire in 48 hours.

What's included:
• Your profile information
• Messages you've sent
• Posts and comments
• Photos you've uploaded

Questions? Reply to this email.

– The Divan Team
```

#### Account Deletion Confirmation
```
Subject: Confirm your account deletion

Hi [Name],

We received a request to delete your Divan account.

[Confirm Deletion]

If you didn't request this, you can ignore this email.
Your account will stay active.

If you confirm:
• Your account enters a 14-day grace period
• You can cancel anytime during those 14 days
• After 14 days, all your data is permanently deleted

– The Divan Team
```

## Implementation Checklist

1. [ ] Create reusable privacy copy component library
2. [ ] Add tooltips to all privacy settings
3. [ ] Implement inline help text
4. [ ] Review all privacy-related strings for plain language
5. [ ] Add "What happens if I turn this off" to all toggles
6. [ ] Localize privacy copy (future)
7. [ ] A/B test copy variations (future)
