"""Central registry for Prometheus metrics used across the backend."""

from __future__ import annotations

from typing import Iterable
import logging

from prometheus_client import Counter, Gauge, Histogram, Summary

log = logging.getLogger(__name__)

_idem = {"hit": 0, "miss": 0, "conflict": 0, "unavail": 0}


REQUEST_COUNTER = Counter(
	"divan_http_requests_total",
	"Total HTTP requests processed",
	["route", "method", "status"],
)

REQUEST_LATENCY = Histogram(
	"divan_http_request_duration_seconds",
	"HTTP request latency in seconds",
	["route", "method"],
	buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0),
)

SOCKET_CLIENTS = Gauge(
	"divan_socketio_clients",
	"Active Socket.IO clients per namespace",
	["namespace"],
)

COMM_SOCKET_CONNECTIONS = Gauge(
	"divan_comm_socket_connections_active",
	"Active Socket.IO connections for communities namespaces",
	["namespace"],
)

SOCKET_EVENTS = Counter(
	"divan_socketio_events_total",
	"Socket.IO events emitted per namespace",
	["namespace", "event"],
)

INTENTS_VERIFIED = Counter(
	"intents_verified_total",
	"Signed intents verified",
)

INTENTS_BAD_SIG = Counter(
	"intents_failed_sig_total",
	"Signed intents bad signature",
)

INTENTS_REPLAY = Counter(
	"intents_replay_total",
	"Signed intents replay",
)

PRESENCE_HEARTBEATS = Counter(
	"divan_presence_heartbeats_total",
	"Presence heartbeats accepted",
	["campus_id"],
)

PRESENCE_REJECTS = Counter(
	"divan_presence_rejects_total",
	"Presence heartbeats rejected",
	["reason"],
)

PRESENCE_SWEEPER_TRIMS = Counter(
	"divan_presence_sweeper_trim_total",
	"Presence GEO members removed by stale sweeper",
)

COMM_NOTIFICATION_INSERT = Counter(
	"divan_comm_notif_insert_total",
	"Communities notifications persisted",
	["result"],
)

COMM_NOTIFICATION_EMIT_FAILURES = Counter(
	"divan_comm_notif_emit_failures_total",
	"Communities notification emit failures",
	["stream"],
)

COMM_NOTIFICATION_OUTBOUND = Counter(
	"divan_comm_notif_outbound_total",
	"Communities notifications queued for outbound delivery",
	["channel"],
)

COMM_PRESENCE_ONLINE_USERS = Gauge(
	"divan_comm_presence_online_users",
	"Communities presence online users",
	["scope"],
)

PROXIMITY_QUERIES = Counter(
	"divan_proximity_queries_total",
	"Nearby proximity queries",
	["radius"],
)

PROXIMITY_RESULTS = Summary(
	"divan_proximity_results_avg",
	"Nearby query result sizes",
)

PRESENCE_ONLINE = Gauge(
	"divan_presence_online_gauge",
	"Active presence users per campus",
	["campus_id"],
)

PRESENCE_HEARTBEAT_MISS = Counter(
	"divan_presence_heartbeat_miss_total",
	"Presence heartbeats missed (stale entries removed)",
	["campus_id"],
)

RATE_LIMITED_EVENTS = Counter(
	"divan_rate_limited_total",
	"Events dropped due to rate limiting",
	["kind"],
)

INVITES_SENT = Counter(
	"divan_invites_sent_total",
	"Invites sent",
	["result"],
)

INVITES_ACCEPTED = Counter(
	"divan_invites_accept_total",
	"Invites accepted",
)

FRIENDSHIPS_ACCEPTED = Counter(
	"divan_friendships_accepted_total",
	"Friendships accepted",
)

BLOCKS_TOTAL = Counter(
	"divan_blocks_total",
	"Block operations",
	["action"],
)
COMMUNITY_REACTIONS_CREATED = Counter(
	"divan_community_reactions_created_total",
	"Reactions created via communities endpoints",
)
COMMUNITY_GROUPS_CREATED = Counter(
	"divan_community_groups_created_total",
	"Groups created via communities API",
)
COMMUNITY_POSTS_CREATED = Counter(
	"divan_community_posts_created_total",
	"Posts created via communities API",
)
COMMUNITY_COMMENTS_CREATED = Counter(
	"divan_community_comments_created_total",
	"Comments created via communities API",
)
EVENTS_CREATED = Counter(
	"divan_events_created_total",
	"Events created via communities API",
)
EVENT_RSVPS_UPDATED = Counter(
	"divan_event_rsvps_updated_total",
	"Event RSVP upserts segmented by resulting action",
	["action"],
)
EVENT_WAITLIST_PROMOTIONS = Counter(
	"divan_event_waitlist_promotions_total",
	"Event waitlist promotions processed",
)
EVENT_REMINDERS_SENT = Counter(
	"divan_event_reminders_sent_total",
	"Event reminders dispatched",
	["offset_hours"],
)
EVENT_REMINDERS_SKIPPED = Counter(
	"divan_event_reminders_skipped_total",
	"Event reminders skipped due to dedupe or schedule",
	["reason"],
)
FEED_FANOUT_EVENTS = Counter(
	"divan_feed_fanout_events_total",
	"Feed fan-out events processed",
)
FEED_ENTRIES_WRITTEN = Counter(
	"divan_feed_entries_written_total",
	"Feed entries written to persistent storage",
)
FEED_REDIS_ZADD_FAILURES = Counter(
	"divan_feed_redis_zadd_failures_total",
	"Redis feed cache write failures",
)
FEED_RANK_RECOMPUTE_DURATION = Histogram(
	"divan_feed_rank_recompute_duration_seconds",
	"Duration of feed rank recompute jobs",
	buckets=(0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0),
)

INVITE_SEND_REJECTS = Counter(
	"divan_invites_send_rejects_total",
	"Rejected invite send attempts",
	["reason"],
)

CHAT_SEND = Counter(
	"divan_chat_send_total",
	"Chat messages sent",
)

CHAT_DELIVERED_UPDATES = Counter(
	"divan_chat_delivered_updates_total",
	"Chat delivery acknowledgements",
)

CHAT_READ_UPDATES = Counter(
	"divan_chat_read_updates_total",
	"Chat read receipts",
)

ROOMS_CREATED = Counter(
	"divan_rooms_created_total",
	"Rooms created",
)

ROOMS_JOIN = Counter(
	"divan_rooms_join_total",
	"Room join operations",
)

ROOMS_SEND = Counter(
	"divan_rooms_send_total",
	"Room broadcast sends",
)

ACTIVITIES_CREATED = Counter(
	"divan_activities_created_total",
	"Activities created",
	["kind"],
)

ABUSE_VELOCITY_TRIPS = Counter(
	"divan_abuse_velocity_trips_total",
	"Velocity trips recorded by the moderation write gate",
	["surface"],
)

RESTRICTIONS_ACTIVE_GAUGE = Gauge(
	"divan_restrictions_active",
	"Active moderation restrictions",
	["mode", "scope"],
)

REPUTATION_BAND_GAUGE = Gauge(
	"divan_reputation_band",
	"Current reputation band observations",
	["band"],
)

HONEY_TRIPS_TOTAL = Counter(
	"divan_honey_trips_total",
	"Honey action trips detected",
)

SHADOW_WRITES_TOTAL = Counter(
	"divan_shadow_writes_total",
	"Shadow restrictions applied to writes",
	["surface"],
)

CAPTCHA_REQUIRED_TOTAL = Counter(
	"divan_captcha_required_total",
	"Captcha requirements issued by the moderation gate",
)

ACTIVITIES_COMPLETED = Counter(
	"divan_activities_completed_total",
	"Activities completed",
	["kind"],
)

LEADERBOARD_EVENTS = Counter(
	"divan_lb_events_processed_total",
	"Leaderboard events processed",
	["stream"],
)

LEADERBOARD_SNAPSHOTS = Counter(
	"divan_lb_snapshots_total",
	"Leaderboard snapshots taken",
	["period", "scope"],
)

REDIS_UP = Gauge("divan_redis_up", "Redis availability (1=up,0=down)")
REDIS_LATENCY = Summary("divan_redis_latency_seconds", "Redis ping latency (seconds)")

POSTGRES_UP = Gauge("divan_postgres_up", "Postgres availability (1=up,0=down)")
POSTGRES_LATENCY = Summary("divan_postgres_latency_seconds", "Postgres ping latency (seconds)")

BACKGROUND_RUNS = Counter(
	"divan_jobs_runs_total",
	"Background job executions",
	["name", "result"],
)

BACKGROUND_DURATION = Histogram(
	"divan_jobs_duration_seconds",
	"Background job duration",
	["name"],
	buckets=(0.1, 0.5, 1.0, 2.0, 5.0, 15.0, 30.0, 60.0),
)

SEARCH_QUERIES = Counter(
	"divan_search_queries_total",
	"Search queries executed",
	["kind"],
)

SEARCH_LATENCY = Histogram(
	"divan_search_latency_seconds",
	"Search latency in seconds",
	["kind"],
	buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0),
)

# Phase F metrics ------------------------------------------------------------

SEARCH_QUERIES_V2 = Counter(
	"search_queries_total",
	"Search queries",
	["type"],
)

SEARCH_DURATION_V2 = Histogram(
	"search_duration_ms",
	"Search duration",
	buckets=[10, 25, 50, 100, 250, 500, 1000],
)

SEARCH_RESULTS_AVG = Gauge(
	"search_results_avg",
	"Avg results per query",
	["type"],
)

FEED_RANK_CANDIDATES = Counter(
	"feed_rank_candidates_total",
	"Candidates considered",
)

FEED_RANK_DURATION = Histogram(
	"feed_rank_duration_ms",
	"Feed rank duration",
	buckets=[5, 10, 20, 40, 80, 160, 320],
)

FEED_RANK_SCORE_AVG = Gauge(
	"feed_rank_score_avg",
	"Average score of top-N",
)

ANTI_GAMING_FLAGS = Counter(
	"anti_gaming_flags_total",
	"Anti-gaming flags",
	["reason"],
)

IDENTITY_REGISTER = Counter(
	"divan_identity_register_total",
	"Successful user registrations",
)

IDENTITY_VERIFY = Counter(
	"divan_identity_verify_total",
	"Email verifications completed",
)

IDENTITY_LOGIN = Counter(
	"divan_identity_login_total",
	"Logins issued",
)

IDENTITY_RESEND = Counter(
	"divan_identity_resend_total",
	"Verification email resends",
)

PROFILE_UPDATE = Counter(
	"divan_profile_update_total",
	"Profile updates applied",
)

AVATAR_UPLOAD = Counter(
	"divan_avatar_upload_total",
	"Avatar uploads committed",
)

IDENTITY_REJECTS = Counter(
	"divan_identity_rejects_total",
	"Identity operation rejects",
	["reason"],
)

RBAC_ROLE_GRANTS = Counter(
	"divan_rbac_role_grants_total",
	"Role-permission grants applied",
	["role", "permission"],
)

RBAC_USER_GRANTS = Counter(
	"divan_rbac_user_grants_total",
	"User role grants applied",
	["role", "scope"],
)

FLAGS_UPSERT = Counter(
	"divan_flags_upsert_total",
	"Feature flag upserts",
	["key", "kind"],
)

FLAGS_EVAL = Counter(
	"divan_flags_eval_total",
	"Feature flag evaluations",
	["key", "kind"],
)

CONSENT_ACCEPT = Counter(
	"divan_consent_accept_total",
	"User consent acceptances",
	["slug", "version"],
)

ACL_CACHE_HITS = Counter(
	"divan_acl_cache_hits_total",
	"ACL cache hits",
)

ACL_CACHE_MISSES = Counter(
	"divan_acl_cache_misses_total",
	"ACL cache misses",
)

IDENTITY_SESSIONS_CREATED = Counter(
	"divan_identity_sessions_created_total",
	"Sessions created",
)

IDENTITY_SESSIONS_REVOKED = Counter(
	"divan_identity_sessions_revoked_total",
	"Sessions revoked",
)

IDENTITY_TWOFA_ENROLL = Counter(
	"divan_identity_2fa_enroll_total",
	"2FA enrollments started",
)

IDENTITY_TWOFA_ENABLE = Counter(
	"divan_identity_2fa_enable_total",
	"2FA enable operations",
)

IDENTITY_TWOFA_VERIFY = Counter(
	"divan_identity_2fa_verify_total",
	"2FA verification attempts",
	["result"],
)

IDENTITY_PWRESET_REQUEST = Counter(
	"divan_identity_pwreset_request_total",
	"Password reset requests",
)

IDENTITY_PWRESET_CONSUME = Counter(
	"divan_identity_pwreset_consume_total",
	"Password reset consumptions",
	["result"],
)

PASSKEY_REGISTER = Counter(
	"divan_passkeys_register_total",
	"Passkey registration attempts",
	["result"],
)

PASSKEY_AUTH = Counter(
	"divan_passkeys_auth_total",
	"Passkey authentication attempts",
	["result"],
)

PASSKEY_DEVICE = Counter(
	"divan_passkeys_devices_total",
	"Passkey device management events",
	["action"],
)

ACCOUNT_LINK = Counter(
	"divan_account_link_total",
	"Account linking operations",
	["provider", "action"],
)

EMAIL_CHANGE = Counter(
	"divan_email_change_total",
	"Email change flow events",
	["action"],
)

PHONE_VERIFY = Counter(
	"divan_phone_verify_total",
	"Phone verification attempts",
	["action", "result"],
)

SCAN_JOBS_TOTAL = Counter(
	"divan_scan_jobs_total",
	"Safety scanning jobs processed",
	["type", "status"],
)

SCAN_FAILURES_TOTAL = Counter(
	"divan_scan_failures_total",
	"Safety scanning failures by type and reason",
	["type", "reason"],
)

SCAN_LATENCY_SECONDS = Histogram(
	"divan_scan_latency_seconds",
	"Safety scanner latency in seconds",
	["type"],
	buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0),
)

QUARANTINE_BACKLOG_GAUGE = Gauge(
	"divan_quarantine_backlog_gauge",
	"Quarantine backlog segmented by status",
	["status"],
)

URL_VERDICT_TOTAL = Counter(
	"divan_url_verdict_total",
	"URL scanner verdict counts",
	["verdict"],
)

UI_SAFETY_QUARANTINE_REVEALS = Counter(
	"ui_safety_quarantine_reveals_total",
	"Moderator UI quarantine reveal events",
)

UI_SAFETY_DECISIONS = Counter(
	"ui_safety_decisions_total",
	"Moderator UI quarantine decisions",
	["verdict"],
)

UI_SAFETY_THRESHOLDS_SIMULATE = Counter(
	"ui_safety_thresholds_simulate_total",
	"Moderator UI threshold simulations triggered",
)

UI_SAFETY_HASH_IMPORT_ROWS = Counter(
	"ui_safety_hash_import_rows_total",
	"Hash rows imported via moderator UI",
)

UI_SAFETY_URL_QUERIES = Counter(
	"ui_safety_url_queries_total",
	"URL reputation queries from moderator UI",
)

NSFW_SCORE_HISTOGRAM = Histogram(
	"divan_nsfw_score_histogram",
	"Distribution of NSFW scores produced by the media scanner",
	buckets=(0.01, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.85, 0.95, 1.0),
)

MOD_REPORTS_TOTAL = Counter(
	"mod_reports_total",
	"Moderation reports processed",
	["reason"],
)

MOD_APPEALS_TOTAL = Counter(
	"mod_appeals_total",
	"Moderation appeals processed",
	["stage", "outcome"],
)

MOD_ESCALATIONS_TOTAL = Counter(
	"mod_escalations_total",
	"Moderation escalations processed",
	["level"],
)

MOD_CASE_TRANSITIONS_TOTAL = Counter(
	"mod_case_transitions_total",
	"Moderation case state transitions",
	["transition"],
)

MOD_AUDIT_LATENCY_SECONDS = Histogram(
	"mod_audit_write_latency_seconds",
	"Latency of moderation audit writes",
	buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0),
)

MOD_REPORT_CASE_LINK_SECONDS = Histogram(
	"mod_report_case_link_duration_seconds",
	"Time from report submission to case linkage",
	buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0),
)

MOD_ADMIN_REQUESTS_TOTAL = Counter(
	"mod_admin_requests_total",
	"Moderation admin API requests",
	["route", "status"],
)

MOD_BATCH_ACTIONS_TOTAL = Counter(
	"mod_batch_actions_total",
	"Moderation batch actions processed",
	["action", "result"],
)

MOD_DASHBOARD_BUILD_MS = Histogram(
	"mod_dashboard_build_ms",
	"Moderation dashboard build latency (milliseconds)",
	buckets=(5.0, 10.0, 25.0, 50.0, 100.0, 250.0, 500.0, 1000.0, 2500.0),
)

MOD_CSV_EXPORTS_TOTAL = Counter(
	"mod_csv_exports_total",
	"Moderation CSV exports triggered",
	["result"],
)

MOD_CASE_LIST_LATENCY_MS = Histogram(
	"mod_case_list_latency_ms",
	"Moderation case list latency (milliseconds)",
	buckets=(5.0, 10.0, 25.0, 50.0, 100.0, 250.0, 500.0, 1000.0),
)

RISK_LOGINS = Counter(
	"divan_risk_logins_total",
	"Risk-scored login outcomes",
	["bucket"],
)

CONTACT_DISCOVERY = Counter(
	"divan_contact_discovery_total",
	"Contact discovery operations",
	["action"],
)

IDENTITY_PRIVACY_UPDATE = Counter(
	"divan_identity_privacy_update_total",
	"Privacy settings updates",
)

IDENTITY_INTERESTS_UPDATE = Counter(
	"divan_identity_interests_update_total",
	"Interest updates applied",
)

IDENTITY_SKILLS_UPDATE = Counter(
	"divan_identity_skills_update_total",
	"Skill updates applied",
)

IDENTITY_LINKS_UPDATE = Counter(
	"divan_identity_links_update_total",
	"Social link updates applied",
)

PROFILES_PUBLIC_REBUILD = Counter(
	"divan_profiles_public_rebuild_total",
	"Public profile rebuild operations",
)

MATCH_PEOPLE_QUERIES = Counter(
	"divan_match_people_queries_total",
	"People matching queries executed",
)

IDENTITY_BLOCK = Counter(
	"divan_identity_block_total",
	"Identity block operations",
	["action"],
)

IDENTITY_EXPORT_REQUEST = Counter(
	"divan_identity_export_request_total",
	"Identity data export requests",
)

IDENTITY_DELETE_REQUEST = Counter(
	"divan_identity_delete_request_total",
	"Identity deletion requests",
)

IDENTITY_DELETE_CONFIRM = Counter(
	"divan_identity_delete_confirm_total",
	"Identity deletion confirmations",
)

VERIFY_SSO_ATTEMPT = Counter(
	"divan_verify_sso_attempt_total",
	"Verification SSO attempts",
	["provider", "result"],
)

VERIFY_DOC_SUBMIT = Counter(
	"divan_verify_doc_submit_total",
	"Verification document submissions",
	["result"],
)

VERIFY_ADMIN_DECISION = Counter(
	"divan_verify_admin_decisions_total",
	"Verification admin decisions",
	["result"],
)

VERIFY_TRUST_RECOMPUTE = Counter(
	"divan_verify_trust_recompute_total",
	"Verification trust recomputations",
)


def observe_request(route: str, method: str, status: int, elapsed_seconds: float) -> None:
	REQUEST_COUNTER.labels(route=route, method=method, status=str(status)).inc()
	REQUEST_LATENCY.labels(route=route, method=method).observe(elapsed_seconds)


def socket_connected(namespace: str) -> None:
	SOCKET_CLIENTS.labels(namespace=namespace).inc()
	COMM_SOCKET_CONNECTIONS.labels(namespace=namespace).inc()


def socket_disconnected(namespace: str) -> None:
	SOCKET_CLIENTS.labels(namespace=namespace).dec()
	COMM_SOCKET_CONNECTIONS.labels(namespace=namespace).dec()


def socket_event(namespace: str, event: str) -> None:
	SOCKET_EVENTS.labels(namespace=namespace, event=event).inc()


def comm_notification_persisted(result: str) -> None:
	COMM_NOTIFICATION_INSERT.labels(result=result).inc()


def comm_notification_emit_failure(stream: str) -> None:
	COMM_NOTIFICATION_EMIT_FAILURES.labels(stream=stream).inc()


def comm_notification_outbound(channel: str) -> None:
	COMM_NOTIFICATION_OUTBOUND.labels(channel=channel).inc()


def comm_presence_online(scope: str, count: int) -> None:
	COMM_PRESENCE_ONLINE_USERS.labels(scope=scope).set(count)


def inc_presence_heartbeat(campus_id: str) -> None:
	PRESENCE_HEARTBEATS.labels(campus_id=campus_id).inc()


def inc_presence_reject(reason: str) -> None:
	PRESENCE_REJECTS.labels(reason=reason).inc()


def inc_proximity_query(radius: int) -> None:
	PROXIMITY_QUERIES.labels(radius=str(radius)).inc()


def inc_invite_sent(result: str) -> None:
	INVITES_SENT.labels(result=result).inc()


def inc_invite_accept() -> None:
	INVITES_ACCEPTED.inc()
	FRIENDSHIPS_ACCEPTED.inc()


def inc_block(action: str) -> None:
	BLOCKS_TOTAL.labels(action=action).inc()


def inc_community_groups_created() -> None:
	COMMUNITY_GROUPS_CREATED.inc()


def inc_community_posts_created() -> None:
	COMMUNITY_POSTS_CREATED.inc()


def inc_community_comments_created() -> None:
	COMMUNITY_COMMENTS_CREATED.inc()


def inc_community_reactions_created() -> None:
	COMMUNITY_REACTIONS_CREATED.inc()


def inc_event_created() -> None:
	EVENTS_CREATED.inc()


def inc_event_rsvp_updated(action: str) -> None:
	EVENT_RSVPS_UPDATED.labels(action=action).inc()


def inc_event_waitlist_promotions(count: int = 1) -> None:
	EVENT_WAITLIST_PROMOTIONS.inc(count)


def inc_event_reminder_sent(offset_hours: int) -> None:
	EVENT_REMINDERS_SENT.labels(offset_hours=str(offset_hours)).inc()


def inc_event_reminder_skipped(reason: str) -> None:
	EVENT_REMINDERS_SKIPPED.labels(reason=reason).inc()


def inc_invite_send_reject(reason: str) -> None:
	INVITE_SEND_REJECTS.labels(reason=reason).inc()


def inc_chat_send() -> None:
	CHAT_SEND.inc()


def inc_chat_delivered() -> None:
	CHAT_DELIVERED_UPDATES.inc()


def inc_chat_read() -> None:
	CHAT_READ_UPDATES.inc()


def inc_room_created() -> None:
	ROOMS_CREATED.inc()


def inc_room_join() -> None:
	ROOMS_JOIN.inc()


def inc_room_send() -> None:
	ROOMS_SEND.inc()


def inc_activity_created(kind: str) -> None:
	ACTIVITIES_CREATED.labels(kind=kind).inc()


def inc_ui_safety_reveal() -> None:
	UI_SAFETY_QUARANTINE_REVEALS.inc()


def inc_ui_safety_decision(verdict: str) -> None:
	UI_SAFETY_DECISIONS.labels(verdict=verdict).inc()


def inc_ui_safety_thresholds_simulate() -> None:
	UI_SAFETY_THRESHOLDS_SIMULATE.inc()


def inc_ui_safety_hash_import_rows(count: int) -> None:
	if count <= 0:
		return
	UI_SAFETY_HASH_IMPORT_ROWS.inc(count)


def inc_ui_safety_url_query() -> None:
	UI_SAFETY_URL_QUERIES.inc()


def inc_activity_completed(kind: str) -> None:
	ACTIVITIES_COMPLETED.labels(kind=kind).inc()


def inc_leaderboard_event(stream: str) -> None:
	LEADERBOARD_EVENTS.labels(stream=stream).inc()


def inc_leaderboard_snapshot(period: str, scope: str) -> None:
	LEADERBOARD_SNAPSHOTS.labels(period=period, scope=scope).inc()


def mark_redis(ok: bool, *, latency_seconds: float | None = None) -> None:
	REDIS_UP.set(1 if ok else 0)
	if latency_seconds is not None:
		REDIS_LATENCY.observe(latency_seconds)


def mark_postgres(ok: bool, *, latency_seconds: float | None = None) -> None:
	POSTGRES_UP.set(1 if ok else 0)
	if latency_seconds is not None:
		POSTGRES_LATENCY.observe(latency_seconds)


def record_job_run(name: str, *, result: str, duration_seconds: float | None = None) -> None:
	BACKGROUND_RUNS.labels(name=name, result=result).inc()
	if duration_seconds is not None:
		BACKGROUND_DURATION.labels(name=name).observe(duration_seconds)


def inc_search_query(kind: str) -> None:
	SEARCH_QUERIES.labels(kind=kind).inc()


def observe_search_latency(kind: str, latency_seconds: float) -> None:
	SEARCH_LATENCY.labels(kind=kind).observe(latency_seconds)


def inc_identity_register() -> None:
	IDENTITY_REGISTER.inc()


def inc_identity_verify() -> None:
	IDENTITY_VERIFY.inc()


def inc_identity_login() -> None:
	IDENTITY_LOGIN.inc()


def inc_identity_resend() -> None:
	IDENTITY_RESEND.inc()


def inc_profile_update() -> None:
	PROFILE_UPDATE.inc()


def inc_avatar_upload() -> None:
	AVATAR_UPLOAD.inc()


def inc_identity_reject(reason: str) -> None:
	IDENTITY_REJECTS.labels(reason=reason).inc()


def inc_identity_session_created() -> None:
	IDENTITY_SESSIONS_CREATED.inc()


def inc_identity_session_revoked() -> None:
	IDENTITY_SESSIONS_REVOKED.inc()


def inc_identity_twofa_enroll() -> None:
	IDENTITY_TWOFA_ENROLL.inc()


def inc_identity_twofa_enable() -> None:
	IDENTITY_TWOFA_ENABLE.inc()


def inc_identity_twofa_verify(result: str) -> None:
	IDENTITY_TWOFA_VERIFY.labels(result=result).inc()


def inc_identity_pwreset_request() -> None:
	IDENTITY_PWRESET_REQUEST.inc()


def inc_identity_pwreset_consume(result: str) -> None:
	IDENTITY_PWRESET_CONSUME.labels(result=result).inc()


def inc_passkey_register(result: str) -> None:
	PASSKEY_REGISTER.labels(result=result).inc()


def inc_passkey_auth(result: str) -> None:
	PASSKEY_AUTH.labels(result=result).inc()


def inc_passkey_device(action: str) -> None:
	PASSKEY_DEVICE.labels(action=action).inc()


def inc_account_link(provider: str, action: str) -> None:
	ACCOUNT_LINK.labels(provider=provider, action=action).inc()


def inc_email_change(action: str) -> None:
	EMAIL_CHANGE.labels(action=action).inc()


def inc_phone_verify(action: str, result: str) -> None:
	PHONE_VERIFY.labels(action=action, result=result).inc()


def inc_risk_login(bucket: str) -> None:
	RISK_LOGINS.labels(bucket=bucket).inc()


def inc_contact_discovery(action: str) -> None:
	CONTACT_DISCOVERY.labels(action=action).inc()


def inc_identity_privacy_update() -> None:
	IDENTITY_PRIVACY_UPDATE.inc()


def inc_identity_block(action: str) -> None:
	IDENTITY_BLOCK.labels(action=action).inc()


def inc_identity_interests_update() -> None:
	IDENTITY_INTERESTS_UPDATE.inc()


def inc_identity_skills_update() -> None:
	IDENTITY_SKILLS_UPDATE.inc()


def inc_identity_links_update() -> None:
	IDENTITY_LINKS_UPDATE.inc()


def inc_profiles_public_rebuild() -> None:
	PROFILES_PUBLIC_REBUILD.inc()


def inc_match_people_query() -> None:
	MATCH_PEOPLE_QUERIES.inc()


def inc_identity_export_request() -> None:
	IDENTITY_EXPORT_REQUEST.inc()


def inc_identity_delete_request() -> None:
	IDENTITY_DELETE_REQUEST.inc()


def inc_identity_delete_confirm() -> None:
	IDENTITY_DELETE_CONFIRM.inc()


def inc_verify_sso_attempt(provider: str, result: str) -> None:
	VERIFY_SSO_ATTEMPT.labels(provider=provider, result=result).inc()


def inc_verify_doc_submit(result: str) -> None:
	VERIFY_DOC_SUBMIT.labels(result=result).inc()


def inc_verify_admin_decision(result: str) -> None:
	VERIFY_ADMIN_DECISION.labels(result=result).inc()


def inc_verify_trust_recompute() -> None:
	VERIFY_TRUST_RECOMPUTE.inc()


def inc_idem_hit() -> None:
	"""Increment idempotency hit counter."""
	_idem["hit"] += 1


def inc_idem_miss() -> None:
	"""Increment idempotency miss counter."""
	_idem["miss"] += 1


def inc_idem_conflict() -> None:
	"""Increment idempotency conflict counter."""
	_idem["conflict"] += 1


def inc_idem_unavail() -> None:
	"""Increment idempotency unavailable counter."""
	_idem["unavail"] += 1


def intent_ok() -> None:
	INTENTS_VERIFIED.inc()


def intent_bad() -> None:
	INTENTS_BAD_SIG.inc()


def intent_replay() -> None:
	INTENTS_REPLAY.inc()


def increment_bulk(counter: Counter, labels: Iterable[tuple[str, str]]) -> None:
	"""Deprecated shim for compatibility with legacy Redis counters."""
	for label_name, label_value in labels:
		counter.labels(**{label_name: label_value}).inc()
