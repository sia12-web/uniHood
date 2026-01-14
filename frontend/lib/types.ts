export type GalleryImage = {
  key: string;
  url: string;
  uploaded_at?: string | null;
};


export type Notification = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  kind: string;
  link?: string | null;
  read_at?: string | null;
  created_at: string;
};

/* Notification moved to top */

export type NearbyUser = {
  user_id: string;
  display_name: string;
  handle: string;
  avatar_url?: string | null;
  major?: string | null;
  bio?: string | null;
  graduation_year?: number | null;
  distance_m?: number | null;
  is_friend?: boolean;
  is_friend_of_friend?: boolean;
  campus_id?: string | null;
  campus_name?: string | null;
  interests?: string[];
  gallery?: GalleryImage[];
  passions?: string[];
  courses?: string[];
  social_links?: SocialLinks;
  banner_url?: string | null;
  ten_year_vision?: string | null;
  is_online?: boolean;
  vibe_tags?: string[];
  top_prompts?: { question: string; answer: string }[];
  gender?: string | null;
  age?: number | null;
  hometown?: string | null;
  languages?: string[];
  relationship_status?: string | null;
  sexual_orientation?: string | null;
  looking_for?: string[];
  height?: number | null;
  lifestyle?: Record<string, string> | null;
  compatibility_hint?: string;
  is_university_verified?: boolean;
  // XP System (optional as not all endpoints might populate it immediately)
  xp?: number;
  level?: number;
  level_label?: string;
  reputation_score?: number;
  review_count?: number;
};

export type DiscoveryProfile = {
  user_id: string;
  core_identity: Record<string, unknown>;
  personality: Record<string, unknown>;
  campus_life: Record<string, unknown>;
  dating_adjacent: Record<string, unknown>;
  taste: Record<string, unknown>;
  playful: Record<string, unknown>;
  auto_tags: string[];
  compatibility_signals: string[];
};

export type DiscoveryProfileUpdate = {
  core_identity?: Record<string, unknown>;
  personality?: Record<string, unknown>;
  campus_life?: Record<string, unknown>;
  dating_adjacent?: Record<string, unknown>;
  taste?: Record<string, unknown>;
  playful?: Record<string, unknown>;
};

export type DiscoveryPrompt = {
  id: string;
  category: string;
  question: string;
  field_key: string;
  type: string;
  options?: string[];
};

export type DiscoveryFeedResponse = {
  items: NearbyUser[];
  cursor: string | null;
  exhausted: boolean;
};

export type NearbyDiff = {
  radius_m: number;
  added: NearbyUser[];
  removed: string[];
  updated: NearbyUser[];
};

export type InviteStatus = "sent" | "accepted" | "declined" | "cancelled" | "expired";

export type InviteSummary = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: InviteStatus;
  created_at: string;
  updated_at: string;
  expires_at: string;
  from_handle?: string | null;
  from_display_name?: string | null;
  to_handle?: string | null;
  to_display_name?: string | null;
};

export type FriendStatus = "pending" | "accepted" | "blocked" | "none";

export type FriendRow = {
  user_id: string;
  friend_id: string;
  status: "pending" | "accepted" | "blocked";
  created_at: string;
  friend_handle?: string | null;
  friend_display_name?: string | null;
  xp?: number;
  level?: number;
};

export type LeaderboardScope = "overall" | "social" | "engagement" | "popularity" | "tictactoe" | "typing_duel" | "trivia" | "rps" | "story_builder";

export type LeaderboardPeriod = "daily" | "weekly" | "monthly";

export type LeaderboardRow = {
  rank: number;
  user_id: string;
  score: number;
  display_name?: string | null;
  handle?: string | null;
  avatar_url?: string | null;
};

export type LeaderboardResponse = {
  scope: LeaderboardScope;
  period: LeaderboardPeriod;
  ymd: number;
  campus_id: string;
  items: LeaderboardRow[];
};

export type StreakSummary = {
  current: number;
  best: number;
  last_active_ymd: number;
};

export type BadgeSummary = {
  kind: string;
  earned_ymd: number;
  meta?: Record<string, unknown>;
};

export type MyLeaderboardSummary = {
  ymd: number;
  campus_id: string;
  ranks: Record<LeaderboardScope, number | null>;
  scores: Record<LeaderboardScope, number | null>;
  counts?: {
    games_played?: number;
    wins?: number;
    // Additional counts from backend
    social_points?: number;
    friends?: number;
    meetups_hosted?: number;
    meetups_joined?: number;
    next_level?: number;
    points_to_next_level?: number;
  };
  streak: StreakSummary;
  badges: BadgeSummary[];
  // XP System
  xp?: number;
  level?: number;
  level_label?: string;
  next_level_xp?: number | null;
};

export type SearchUserResult = {
  user_id: string;
  handle: string;
  display_name: string;
  avatar_url?: string | null;
  is_friend: boolean;
  mutual_count: number;
  score: number;
};

export type RoomDiscoverResult = {
  room_id: string;
  name: string;
  preset: "2-4" | "4-6" | "12+";
  members_count: number;
  msg_24h: number;
  score: number;
};

export type PagedResponse<T> = {
  items: T[];
  cursor?: string | null;
};

export type VisibilityScope = "everyone" | "friends" | "none";

export type InterestNode = {
  id: string;
  slug: string;
  name: string;
  parent_id?: string | null;
};

export type MyInterest = {
  interest_id: string;
  slug: string;
  name: string;
  visibility: VisibilityScope;
  added_at: string;
};

export type MySkill = {
  name: string;
  display: string;
  proficiency: number;
  visibility: VisibilityScope;
  added_at: string;
};

export type MyLink = {
  kind: string;
  url: string;
  visibility: VisibilityScope;
};

export type EducationRecord = {
  program: string;
  year?: number | null;
  visibility: VisibilityScope;
  updated_at: string;
};

export type PublicSkill = {
  display: string;
  proficiency: number;
};

export type PublicLink = {
  kind: string;
  url: string;
};

export type PublicProfile = {
  user_id: string;
  handle: string;
  display_name: string;
  avatar_url?: string | null;
  campus_id?: string | null;
  bio: string;
  program?: string | null;
  year?: number | null;
  interests: string[];
  skills: PublicSkill[];
  links: PublicLink[];
  gallery?: GalleryImage[];
  // XP
  xp: number;
  level: number;
  level_label: string;
  next_level_xp?: number | null;
};

export type MatchPerson = {
  user_id: string;
  handle: string;
  display_name: string;
  avatar_url?: string | null;
  campus_id?: string | null;
  score: number;
  interests: string[];
  skills: PublicSkill[];
  // XP
  xp: number;
  level: number;
  level_label: string;
};

export type CampusRow = {
  id: string;
  name: string;
  domain: string;
  logo_url?: string | null;
};

export type ProfilePrivacy = {
  visibility: "everyone" | "friends" | "none";
  ghost_mode: boolean;
  discoverable_by_email: boolean;
  show_online_status: boolean;
  share_activity: boolean;
};

export type ProfileStatus = {
  text: string;
  emoji: string;
  updated_at: string;
  banner_url?: string | null;
};

export type SocialLinks = {
  instagram?: string | null;
  linkedin?: string | null;
  twitter?: string | null;
  tiktok?: string | null;
  website?: string | null;
};

export type ProfileRecord = {
  id: string;
  email: string;
  email_verified: boolean;
  handle: string;
  display_name: string;
  bio: string;
  avatar_url?: string | null;
  avatar_key?: string | null;
  campus_id?: string | null;
  privacy: ProfilePrivacy;
  status: ProfileStatus;
  major?: string | null;
  graduation_year?: number | null;
  passions: string[];
  courses?: ProfileCourse[];
  gallery?: ProfileGalleryImage[];
  social_links?: SocialLinks;
  ten_year_vision?: string | null;
  gender?: string | null;
  birthday?: string | null;
  hometown?: string | null;
  relationship_status?: string | null;
  sexual_orientation?: string | null;
  looking_for?: string[] | null;
  height?: number | null;
  languages?: string[] | null;
  profile_prompts?: { question: string; answer: string }[] | null;
  lifestyle?: Record<string, string> | null;
  is_university_verified: boolean;
  // XP System
  xp: number;
  level: number;
  level_label: string;
  next_level_xp?: number | null;
  reputation_score?: number;
  review_count?: number;
};

// Minimal image shape used by profile gallery UI
export type ProfileGalleryImage = {
  key: string;
  url: string;
};

export type ProfileCourse = {
  id?: string;
  name: string;
  code?: string | null;
  term?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type BlockEntry = {
  blocked_id: string;
  blocked_handle?: string | null;
  blocked_display_name?: string | null;
  created_at: string;
};

export type NotificationPrefs = {
  invites: boolean;
  friends: boolean;
  chat: boolean;
  rooms: boolean;
  activities: boolean;
};

export type ExportStatus = {
  status: "pending" | "ready" | "expired";
  requested_at: string;
  completed_at?: string | null;
  download_url?: string | null;
};

export type DeletionStatus = {
  requested_at: string;
  confirmed_at?: string | null;
  purged_at?: string | null;
};

export type AuditLogItem = {
  id: number;
  event: string;
  meta: Record<string, string>;
  created_at: string;
};

export type VerificationMethod = "sso" | "doc";

export type VerificationState = "pending" | "approved" | "rejected" | "expired";

export type VerificationEntry = {
  id: string;
  user_id: string;
  method: VerificationMethod;
  state: VerificationState;
  evidence: Record<string, unknown>;
  reason?: string | null;
  expires_at?: string | null;
  created_at: string;
  decided_at?: string | null;
};

export type TrustProfileSummary = {
  trust_level: number;
  badge?: string | null;
  verified_at?: string | null;
  expires_at?: string | null;
};

export type VerificationStatus = {
  trust: TrustProfileSummary;
  verifications: VerificationEntry[];
};

export type VerificationSsoStart = {
  authorize_url: string;
  state: string;
  code_verifier: string;
  code_challenge: string;
};

export type VerificationDocPresign = {
  key: string;
  url: string;
  expires_s: number;
};

export type AdminVerificationDecision = {
  approve: boolean;
  note?: string | null;
};

export type PermissionRow = {
  id: string;
  action: string;
  description: string;
};

export type RoleRow = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  permissions: PermissionRow[];
};

export type UserRoleRow = {
  role_id: string;
  role_name: string;
  campus_id?: string | null;
  granted_by?: string | null;
  created_at: string;
};

export type FeatureFlagKind = "bool" | "percentage" | "allowlist" | "experiment";

export type FeatureFlagRow = {
  key: string;
  kind: FeatureFlagKind;
  description: string;
  payload: Record<string, unknown>;
};

export type FlagOverrideRow = {
  key: string;
  user_id?: string | null;
  campus_id?: string | null;
  value: Record<string, unknown>;
  created_at: string;
};

export type PolicyDocumentRow = {
  slug: string;
  version: string;
  title: string;
  content_md: string;
  required: boolean;
  created_at: string;
};

export type PolicySummaryRow = {
  slug: string;
  version: string;
  required: boolean;
  title: string;
};

export type ConsentRecordRow = {
  policy_slug: string;
  version: string;
  accepted: boolean;
  accepted_at: string;
  meta: Record<string, unknown>;
};

export type ConsentGateResponse = {
  missing: PolicySummaryRow[];
};

export type FlagEvaluationResultRow = {
  enabled: boolean | null;
  variant?: string | null;
  meta: Record<string, unknown>;
};

export type PasskeyDeviceRow = {
  id: string;
  label: string;
  aaguid?: string | null;
  transports: string[];
  created_at: string;
  last_used_at?: string | null;
};

export type TrustedDeviceRow = {
  id: string;
  label: string;
  platform: string;
  browser: string;
  last_ip?: string | null;
  first_seen: string;
  last_seen: string;
  revoked: boolean;
};

export type LinkedAccountRow = {
  id: string;
  provider: "google" | "microsoft" | "apple";
  subject: string;
  email?: string | null;
  created_at: string;
};

export type LinkStartResponse = {
  authorizeUrl: string;
  state: string;
  codeVerifier: string;
  codeChallenge: string;
};

export type PhoneNumberOut = {
  e164: string;
  verified: boolean;
  verified_at?: string | null;
};

export type ContactSaltResponse = {
  salt: string;
  rotates_at: string;
};

export type ContactOptInResponse = {
  enabled: boolean;
  updated_at: string;
};

export type ContactMatchResult = {
  handles: string[];
};

export type ContactUploadResult = {
  status: string;
  count: number;
};
