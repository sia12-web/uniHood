export type GalleryImage = {
  key: string;
  url: string;
  uploaded_at?: string | null;
};

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
  interests?: string[];
  gallery?: GalleryImage[];
  passions?: string[];
  courses?: string[];
};export type NearbyDiff = {
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
};

export type LeaderboardScope = "overall" | "social" | "engagement" | "popularity";

export type LeaderboardPeriod = "daily" | "weekly" | "monthly";

export type LeaderboardRow = {
  rank: number;
  user_id: string;
  score: number;
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
  streak: StreakSummary;
  badges: BadgeSummary[];
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
};

export type CampusRow = {
  id: string;
  name: string;
  domain: string;
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
