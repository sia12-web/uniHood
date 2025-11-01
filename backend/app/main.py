"""FastAPI application entrypoint."""

from __future__ import annotations

import asyncio
from pathlib import Path
from contextlib import asynccontextmanager

import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
	account_link,
	account_updates,
	activities,
	admin_verify,
	auth,
	chat,
	consent as consent_api,
	contact_discovery,
	flags as flags_api,
	interests,
	leaderboards,
	ops,
	passkeys as passkeys_api,
	privacy,
	profile,
	public_profile,
	proximity,
	rbac as rbac_api,
	rooms,
	search,
	security,
	social,
	verify,
)
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
from app.infra.redis import redis_client
from app.moderation import configure_postgres as configure_moderation
from app.moderation import router as moderation_router
from app.moderation import spawn_workers as spawn_moderation_workers
from app.domain.activities.sockets import ActivitiesNamespace, set_namespace as set_activities_namespace
from app.domain.chat.sockets import ChatNamespace, set_namespace as set_chat_namespace
from app.domain.proximity.sockets import PresenceNamespace
from app.domain.rooms.sockets import RoomsNamespace, set_namespace as set_rooms_namespace
from app.domain.social.sockets import SocialNamespace, set_namespace
from app.infra import postgres
from app.settings import settings
from app.obs import init as obs_init
from app.settings import settings


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
		app.state.communities_scheduler = scheduler
		app.state.communities_workers = worker_instances
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
		await postgres.close_pool()


app = FastAPI(title="Divan Proximity Core", lifespan=lifespan)

if settings.environment == "dev":
	allow_origins = [
		"http://localhost",
		"http://127.0.0.1",
		"http://localhost:80",
		"http://127.0.0.1:80",
		"http://localhost:3000",
		"http://127.0.0.1:3000",
	]
else:
	allow_origins = [
		"https://app.divan.example",  # placeholder for production
	]

app.add_middleware(
	CORSMiddleware,
	allow_origins=allow_origins,
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
)
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
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
activities_namespace = ActivitiesNamespace()
sio.register_namespace(activities_namespace)
set_activities_namespace(activities_namespace)
communities_socketio.register(sio)
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
obs_init(app, sio)


app.include_router(auth.router, tags=["identity"])
app.include_router(interests.router, tags=["identity"])
app.include_router(profile.router, tags=["profile"])
app.include_router(public_profile.router, tags=["profile"])
app.include_router(proximity.router, tags=["proximity"])
app.include_router(social.router, tags=["social"])
app.include_router(chat.router, tags=["chat"])
app.include_router(rooms.router, tags=["rooms"])
app.include_router(activities.router, tags=["activities"])
app.include_router(leaderboards.router, tags=["leaderboards"])
app.include_router(security.router, tags=["security"])
app.include_router(search.router, tags=["search"])
app.include_router(ops.router, tags=["ops"])
app.include_router(privacy.router, tags=["privacy"])
app.include_router(verify.router, tags=["verification"])
app.include_router(admin_verify.router, tags=["admin"])
app.include_router(rbac_api.router)
app.include_router(flags_api.router)
app.include_router(consent_api.router)
app.include_router(passkeys_api.router)
app.include_router(account_link.router)
app.include_router(account_updates.router)
app.include_router(contact_discovery.router)
app.include_router(communities_router)
app.include_router(moderation_router, tags=["moderation"])
