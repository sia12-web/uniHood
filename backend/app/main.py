"""FastAPI application entrypoint."""

from __future__ import annotations

import asyncio
from pathlib import Path
from contextlib import asynccontextmanager

import socketio
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi import Request
from starlette.staticfiles import StaticFiles
import os
from pathlib import Path

from app.api import (
	account_link,
	account_updates,
	activities,
	admin_verify,
	auth,
	chat,
	courses,
	discovery,
	consent as consent_api,
	contact as contact_api,
	contact_discovery,
	flags as flags_api,
	interests,
	internal_ops,
	leaderboards,
	legal as legal_api,
	meetups,
	ops,
	passkeys as passkeys_api,
	privacy,
	profile,
	public_profile,
	proximity,
	rbac as rbac_api,
	rooms,
	clubs,
	search,
	security,
	social,
	verify,
	xp as xp_api,
)
from app.api.analytics import router as public_analytics_router
from app.domain.analytics import api as admin_analytics_api
from app.communities import router as communities_router
from app.communities.infra.scheduler import FeedScheduler
from app.communities.infra import socketio as communities_socketio
from app.communities.workers.fanout_worker import FanoutWorker
from app.communities.workers.feed_rebuilder import FeedRebuilder
from app.communities.workers.notification_builder import NotificationBuilder
from app.communities.workers.outbox_indexer import OutboxIndexer
from app.communities.workers.rank_updater import RankUpdater
from app.communities.workers.realtime_dispatcher import RealtimeDispatcher
from app.communities.workers.stream_emitter import StreamEmitter
from app.communities.workers.unread_sync import UnreadSyncWorker
from app.communities.jobs.invite_gc import InviteGarbageCollector
from app.communities.jobs.membership_integrity import MembershipIntegrityJob
from app.communities.jobs.anti_gaming import AntiGamingAnomalyJob
from app.domain.leaderboards import jobs as leaderboard_jobs
from app.infra.redis import redis_client
from app.maintenance.retention import purge_soft_deleted
from app.moderation import configure_postgres as configure_moderation
from app.moderation import router as moderation_router
from app.moderation import spawn_workers as spawn_moderation_workers
from app.domain.activities.sockets import ActivitiesNamespace, set_namespace as set_activities_namespace
from app.domain.chat.sockets import ChatNamespace, set_namespace as set_chat_namespace
from app.domain.proximity import live_sessions
from app.domain.proximity.sockets import PresenceNamespace
from app.domain.rooms.sockets import RoomsNamespace, set_namespace as set_rooms_namespace
from app.domain.social.sockets import SocialNamespace, set_namespace
from app.infra import postgres
from app.settings import settings
from app.obs import init as obs_init
from app.api.middleware_request_id import RequestIdMiddleware
from app.api.middleware_idempotency import IdempotencyMiddleware
from app.api.middleware_signed_intent import SignedIntentMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.api.openapi import custom_openapi
from app.api.errors import install_error_handlers
from app.settings import settings

MCGILL_CAMPUS_ID = "c4f7d1ec-7b01-4f7b-a1cb-4ef0a1d57ae2"
MCGILL_CAMPUS_DOMAIN = None  # allow any email domain while keeping campus id real
MCGILL_CAMPUS_NAME = "McGill University"
MCGILL_LAT = 45.5048
MCGILL_LON = -73.5772


async def ensure_mcgill_campus(pool) -> None:
	"""Ensure the real McGill campus is seeded in the database."""
	if not pool:
		return
	from uuid import UUID
	mcgill_uuid = UUID(MCGILL_CAMPUS_ID)
	async with pool.acquire() as conn:
		await conn.execute(
			"""
			INSERT INTO campuses (id, name, domain, lat, lon)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (id) DO UPDATE SET
				name = EXCLUDED.name,
				domain = EXCLUDED.domain,
				lat = COALESCE(campuses.lat, EXCLUDED.lat),
				lon = COALESCE(campuses.lon, EXCLUDED.lon)
			""",
			mcgill_uuid,
			MCGILL_CAMPUS_NAME,
			MCGILL_CAMPUS_DOMAIN,
			MCGILL_LAT,
			MCGILL_LON,
		)

@asynccontextmanager
async def lifespan(app: FastAPI):
	pool = await postgres.init_pool()
	base_config_dir = Path(__file__).resolve().parent.parent / "config"
	thresholds_path = base_config_dir / "moderation.yml"
	reputation_path = base_config_dir / "moderation_reputation.yml"
	configure_moderation(
		pool,
		redis_client,
		safety_thresholds_path=str(thresholds_path),
		reputation_config_path=str(reputation_path) if reputation_path.exists() else None,
	)
	worker_tasks: list[asyncio.Task] = []
	worker_instances: list[object] = []
	scheduler: FeedScheduler | None = None
	if settings.moderation_workers_enabled:
		moderation_tasks = list(spawn_moderation_workers(redis_client))
		worker_tasks.extend(moderation_tasks)
	if settings.communities_workers_enabled:
		outbox_worker = OutboxIndexer()
		stream_worker = StreamEmitter()
		fanout_worker = FanoutWorker()
		rebuild_worker = FeedRebuilder()
		rank_worker = RankUpdater()
		realtime_worker = RealtimeDispatcher()
		notification_worker = NotificationBuilder()
		unread_worker = UnreadSyncWorker()
		invite_gc_job = InviteGarbageCollector()
		membership_job = MembershipIntegrityJob()
		anti_gaming_job = AntiGamingAnomalyJob()
		scheduler = FeedScheduler()
		worker_instances.extend(
			[
				outbox_worker,
				stream_worker,
				fanout_worker,
				rebuild_worker,
				rank_worker,
				realtime_worker,
				notification_worker,
				unread_worker,
				invite_gc_job,
				membership_job,
				anti_gaming_job,
			]
		)
		worker_tasks.append(
			asyncio.create_task(outbox_worker.run_forever(), name="communities-outbox-indexer")
		)
		worker_tasks.append(
			asyncio.create_task(stream_worker.run_forever(), name="communities-stream-emitter")
		)
		worker_tasks.append(
			asyncio.create_task(fanout_worker.run_forever(), name="communities-feed-fanout")
		)
		worker_tasks.append(
			asyncio.create_task(rebuild_worker.run_forever(), name="communities-feed-rebuilder")
		)
		worker_tasks.append(
			asyncio.create_task(realtime_worker.run_forever(), name="communities-realtime-dispatcher")
		)
		worker_tasks.append(
			asyncio.create_task(notification_worker.run_forever(), name="communities-notification-builder")
		)
		worker_tasks.append(
			asyncio.create_task(unread_worker.run_forever(), name="communities-unread-sync")
		)
		scheduler.start()
		scheduler.schedule_hourly("communities-feed-rank", rank_worker.run_once, hours=1)
		scheduler.schedule_hourly("communities-invite-gc", invite_gc_job.run_once, hours=1)
		scheduler.schedule_hourly("communities-membership-integrity", membership_job.run_once, hours=1)
		scheduler.schedule_hourly("communities-anti-gaming", anti_gaming_job.run_once, hours=1)
		scheduler.schedule_hourly("retention-purge", purge_soft_deleted, hours=24)
		# Leaderboard computation - runs every 5 minutes for near-real-time updates
		scheduler.schedule_minutes("leaderboard-snapshot", leaderboard_jobs.finalize_daily_leaderboards, minutes=5)
		# Run leaderboard snapshot once at startup
		asyncio.create_task(leaderboard_jobs.finalize_daily_leaderboards(), name="leaderboard-startup")
		app.state.communities_scheduler = scheduler
	app.state.communities_workers = worker_instances
	worker_tasks.append(
		asyncio.create_task(live_sessions.run_presence_sweeper(redis_client), name="presence-sweeper")
	)
	# Ensure McGill campus exists for onboarding flows
	try:
		await ensure_mcgill_campus(pool)
	except Exception as e:
		print(f"ERROR: Failed to seed McGill campus: {e}", flush=True)
	try:
		yield
	finally:
		if scheduler is not None:
			scheduler.shutdown()
		for instance in worker_instances:
			stop = getattr(instance, "stop", None)
			if callable(stop):
				stop()
		if worker_tasks:
			for task in worker_tasks:
				task.cancel()
			await asyncio.gather(*worker_tasks, return_exceptions=True)
		await live_sessions.shutdown()
		await postgres.close_pool()


app = FastAPI(title="uniHood Core", lifespan=lifespan)
custom_openapi(app)
install_error_handlers(app)



# Always configure upload base URL for avatar presigning
from app.domain.identity import s3 as _s3  # local import to avoid circulars
_s3.DEFAULT_BASE_URL = settings.upload_base_url or "http://localhost:8001/uploads"

raw_origins = getattr(settings, "cors_allow_origins", [])
if isinstance(raw_origins, str):
	# Handle comma-separated string from env var
	allow_origins = [o.strip() for o in raw_origins.split(",") if o.strip()]
elif isinstance(raw_origins, (list, tuple)):
	allow_origins = list(raw_origins)
else:
	allow_origins = []

# Baseline production and dev origins
baseline_origins = [
	"https://unihood.app",
	"https://www.unihood.app",
	"https://unihood-frontend.onrender.com",
	"https://unihood-backend-14x8.onrender.com",
	"http://localhost:3000",
	"http://127.0.0.1:3000",
	"https://localhost:3000",
]

for o in baseline_origins:
	if o not in allow_origins:
		allow_origins.append(o)

print(f"DEBUG: Final CORS origins: {allow_origins}", flush=True)

# Starlette disallows wildcard '*' with allow_credentials=True. Replace '*' with explicit origins.
if "*" in allow_origins:
	if settings.environment in ["dev", "development"]:
		allow_origins = [
			"http://localhost:3000",
			"https://localhost:3000",
			"http://127.0.0.1:3000",
			"https://127.0.0.1:3000",
			"http://localhost:5173",
			"http://127.0.0.1:5173",
			"http://localhost:4173",
			"http://127.0.0.1:4173",
			"http://localhost:3001",
			"https://localhost:3001",
			"http://127.0.0.1:3001",
			"https://127.0.0.1:3001",
		]
	else:
		allow_origins = ["https://unihood.app", "https://www.unihood.app", "https://unihood-frontend.onrender.com"]

app.add_middleware(GZipMiddleware, minimum_size=1000)


# Upload endpoints (PUT/GET) used by the avatar presign flow.
# In production, set UPLOAD_DIR to a persistent disk mount (e.g. /app/uploads).
from fastapi import APIRouter
from fastapi.responses import FileResponse

uploads_router = APIRouter()
upload_root = Path(os.environ.get("UPLOAD_DIR") or os.environ.get("DIVAN_UPLOAD_ROOT") or "app/uploads").resolve()
upload_root.mkdir(parents=True, exist_ok=True)

print(f"DEBUG: uploads_router initialized (root={upload_root})", flush=True)


@uploads_router.put("/{path:path}")
async def _put_upload(path: str, request: Request):
	rel = Path(path)
	target = (upload_root / rel).resolve()
	if not str(target).startswith(str(upload_root)):
		from fastapi import HTTPException
		raise HTTPException(status_code=400, detail="invalid_path")
	target.parent.mkdir(parents=True, exist_ok=True)
	data = await request.body()
	# 5MB limit (matches avatar constraints)
	if len(data) > 5 * 1024 * 1024:
		from fastapi import HTTPException
		raise HTTPException(status_code=413, detail="too_large")
	with open(target, "wb") as fh:
		fh.write(data)
	return {"ok": True, "bytes": len(data)}


@uploads_router.get("/{path:path}")
async def _get_upload(path: str):
	import mimetypes
	from typing import Optional

	rel = Path(path)
	target = (upload_root / rel).resolve()
	if not str(target).startswith(str(upload_root)) or not target.exists() or not target.is_file():
		from fastapi import HTTPException
		raise HTTPException(status_code=404, detail="not_found")

	def _sniff_media_type(file_path: Path) -> Optional[str]:
		try:
			with open(file_path, "rb") as fh:
				header = fh.read(16)
		except Exception:
			return None
		# JPEG
		if header.startswith(b"\xFF\xD8\xFF"):
			return "image/jpeg"
		# PNG
		if header.startswith(b"\x89PNG\r\n\x1a\n"):
			return "image/png"
		# WEBP: RIFF....WEBP
		if len(header) >= 12 and header[0:4] == b"RIFF" and header[8:12] == b"WEBP":
			return "image/webp"
		return None

	media_type, _ = mimetypes.guess_type(str(target))
	if not media_type:
		media_type = _sniff_media_type(target)
	return FileResponse(target, media_type=media_type or "application/octet-stream")


@uploads_router.head("/{path:path}")
async def _head_upload(path: str):
	# Some clients (including image optimizers/CDNs) perform HEAD requests.
	# Mirror GET behavior but return an empty body.
	import mimetypes
	from fastapi import Response
	from typing import Optional

	rel = Path(path)
	target = (upload_root / rel).resolve()
	if not str(target).startswith(str(upload_root)) or not target.exists() or not target.is_file():
		from fastapi import HTTPException
		raise HTTPException(status_code=404, detail="not_found")

	def _sniff_media_type(file_path: Path) -> Optional[str]:
		try:
			with open(file_path, "rb") as fh:
				header = fh.read(16)
		except Exception:
			return None
		if header.startswith(b"\xFF\xD8\xFF"):
			return "image/jpeg"
		if header.startswith(b"\x89PNG\r\n\x1a\n"):
			return "image/png"
		if len(header) >= 12 and header[0:4] == b"RIFF" and header[8:12] == b"WEBP":
			return "image/webp"
		return None

	media_type, _ = mimetypes.guess_type(str(target))
	if not media_type:
		media_type = _sniff_media_type(target)
	# Send Content-Type so browsers accept the resource under nosniff.
	return Response(status_code=200, headers={"Content-Type": media_type or "application/octet-stream"})

# Use the same allowed origins for Socket.IO as for the REST API
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=allow_origins)
sio.register_namespace(PresenceNamespace())
social_namespace = SocialNamespace()
sio.register_namespace(social_namespace)
set_namespace(social_namespace)
chat_namespace = ChatNamespace()
sio.register_namespace(chat_namespace)
set_chat_namespace(chat_namespace)
rooms_namespace = RoomsNamespace()
sio.register_namespace(rooms_namespace)
set_rooms_namespace(rooms_namespace)
from app.domain.xp.sockets import XPNamespace, set_namespace as set_xp_namespace

activities_namespace = ActivitiesNamespace()
sio.register_namespace(activities_namespace)
set_activities_namespace(activities_namespace)

xp_namespace = XPNamespace()
sio.register_namespace(xp_namespace)
set_xp_namespace(xp_namespace)

communities_socketio.register(sio)
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
# Mount the socket app to allow running 'app' directly (e.g. uvicorn app.main:app)
app.mount("/socket.io", socketio.ASGIApp(sio, socketio_path=""))
obs_init(app, sio)





# Ensure every request carries an X-Request-Id and make it available on request.state
app.add_middleware(RequestIdMiddleware)
app.add_middleware(IdempotencyMiddleware)
app.add_middleware(
	SignedIntentMiddleware,
	protected_paths=(
		"/admin",
		"/flags",
	),
)
# Security headers - enable HSTS only in production with HTTPS
app.add_middleware(
	SecurityHeadersMiddleware,
	enable_hsts=(settings.environment == "production" and settings.cookie_secure)
)


app.add_middleware(
	CORSMiddleware,
	allow_origins=allow_origins,
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
)




# Enable uploads in all environments (for production, ensure persistent storage or use S3)
if uploads_router is not None:
	app.include_router(uploads_router, prefix="/uploads", tags=["uploads"])
	print("DEBUG: uploads_router included at /uploads", flush=True)

app.include_router(auth.router, tags=["identity"])
app.include_router(courses.router, tags=["identity"])
app.include_router(interests.router, tags=["identity"])
app.include_router(profile.router, tags=["profile"])
app.include_router(public_profile.router, tags=["profile"])
app.include_router(proximity.router, tags=["proximity"])
app.include_router(discovery.router, tags=["discovery"])
app.include_router(social.router, tags=["social"])
app.include_router(chat.router, tags=["chat"])
app.include_router(rooms.router, tags=["rooms"])
app.include_router(clubs.router, tags=["clubs"])
app.include_router(activities.router, tags=["activities"])
app.include_router(leaderboards.router, tags=["leaderboards"])
app.include_router(meetups.router, tags=["meetups"])
app.include_router(security.router, tags=["security"])
app.include_router(search.router, tags=["search"])
app.include_router(ops.router, tags=["ops"])
app.include_router(internal_ops.router, tags=["internal"])
app.include_router(privacy.router, tags=["privacy"])
app.include_router(verify.router, tags=["verification"])
app.include_router(admin_verify.router, tags=["admin"])
app.include_router(rbac_api.router)
app.include_router(flags_api.router)
app.include_router(consent_api.router)
app.include_router(passkeys_api.router)
app.include_router(legal_api.router)
app.include_router(account_link.router)
app.include_router(account_updates.router)
app.include_router(contact_discovery.router)
app.include_router(contact_api.router, tags=["contact"])
app.include_router(communities_router)
app.include_router(moderation_router, tags=["moderation"])
app.include_router(public_analytics_router)
app.include_router(admin_analytics_api.router)
app.include_router(xp_api.router)
