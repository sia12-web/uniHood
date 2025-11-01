"""Lightweight service container shared by moderation modules."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, Mapping, Optional, Sequence

import asyncpg
from redis.asyncio import Redis

from app.communities.domain.notifications_service import NotificationService
from app.moderation.domain.cases_service import CaseService, SubjectResolver
from app.moderation.domain.detectors.bundle import DetectorSuite
from app.moderation.domain.enforcement import (
	EnforcementHooks,
	InMemoryModerationRepository,
	ModerationCase,
	ModerationEnforcer,
	ModerationRepository,
)
from app.moderation.domain.ip_enrichment import (
	InMemoryIpReputationRepository,
	IpEnrichmentService,
	IpReputationRepository,
)
from app.moderation.domain.linkage import InMemoryLinkageRepository, LinkageRepository, LinkageService
from app.moderation.domain.policy_engine import Policy, PolicyRule
from app.moderation.domain.reputation import (
	InMemoryReputationRepository,
	ReputationRepository,
	ReputationService,
)
from app.moderation.domain.reputation_config import ReputationConfig, load_reputation_config
from app.moderation.domain.restrictions import (
	InMemoryRestrictionRepository,
	RestrictionRepository,
	RestrictionService,
)
from app.moderation.domain.safety_repository import InMemorySafetyRepository, SafetyRepository
from app.moderation.domain.thresholds import ModerationThresholds, load_thresholds
from app.moderation.domain.trust import TrustLedger, TrustRepository
from app.moderation.domain.velocity import VelocityConfig, VelocityService, default_velocity_config
from app.moderation.domain.tools.catalog import ActionsCatalogService
from app.moderation.infra.enforcement_hooks import CommunitiesEnforcementHooks
from app.moderation.infra.ip_reputation_repo import PostgresIpReputationRepository
from app.moderation.infra.linkage_repo import PostgresLinkageRepository
from app.moderation.infra.postgres_repo import PostgresModerationRepository
from app.moderation.infra.reputation_repo import PostgresReputationRepository
from app.moderation.infra.restriction_repo import PostgresRestrictionRepository
from app.moderation.infra.safety_repo import PostgresSafetyRepository
from app.moderation.infra.subject_resolver import CommunitiesSubjectResolver
from app.moderation.infra.trust_repo import PostgresTrustRepository
from app.moderation.middleware.write_gate_v2 import WriteGateV2
from app.infra.redis import RedisProxy, redis_client
from app.settings import settings

if TYPE_CHECKING:  # pragma: no cover - type-only imports
    from app.moderation.domain.tools.bundle_io import BundleService
    from app.moderation.domain.tools.executor import AdminToolsExecutor
    from app.moderation.domain.tools.guards import GuardEvaluator
    from app.moderation.domain.tools.jobs import BatchJobScheduler
    from app.moderation.domain.tools.revertors import RevertRegistry


class InMemoryTrustRepository(TrustRepository):
    def __init__(self) -> None:
        self.store: dict[str, int] = {}

    async def get_score(self, user_id: str) -> int | None:
        return self.store.get(user_id)

    async def upsert_score(self, user_id: str, score: int, event_at: datetime) -> None:
        self.store[user_id] = score


class NoopHooks(EnforcementHooks):
    async def tombstone(self, case: ModerationCase, payload: Mapping[str, Any]) -> None:
        return None

    async def remove(self, case: ModerationCase, payload: Mapping[str, Any]) -> None:
        return None

    async def shadow_hide(self, case: ModerationCase, payload: Mapping[str, Any]) -> None:
        return None

    async def mute(self, case: ModerationCase, payload: Mapping[str, Any]) -> None:
        return None

    async def ban(self, case: ModerationCase, payload: Mapping[str, Any]) -> None:
        return None

    async def warn(self, case: ModerationCase, payload: Mapping[str, Any]) -> None:
        return None

    async def restrict_create(self, case: ModerationCase, payload: Mapping[str, Any], expires_at: datetime) -> None:
        return None


_repository: ModerationRepository = InMemoryModerationRepository()
_trust_repo: TrustRepository = InMemoryTrustRepository()
_trust_ledger = TrustLedger(repository=_trust_repo)
_hooks: EnforcementHooks = NoopHooks()
_detectors = DetectorSuite()
_notifications: NotificationService = NotificationService()
_staff_ids: tuple[str, ...] = tuple(settings.moderation_staff_ids)
_policy = Policy(
    policy_id="default",
    version=1,
    default_action="none",
    rules=[
        PolicyRule(
            rule_id="profanity.basic",
            when={"text.any_of": ["profanity>medium"]},
            action="tombstone",
            severity=2,
            reason="profanity",
        ),
        PolicyRule(
            rule_id="spam.duplicate",
            when={"signals.all_of": ["dup_text_5m", "high_velocity_posts"]},
            action="shadow_hide",
            severity=2,
            reason="spam_duplicate",
        ),
        PolicyRule(
            rule_id="trust.low_throttle",
            when={"user.trust_below": 20},
            action="restrict_create",
            severity=1,
            payload={"targets": ["post", "comment", "message"], "ttl_minutes": 60},
            reason="low_trust_throttle",
        ),
    ],
)
_enforcer = ModerationEnforcer(repository=_repository, hooks=_hooks)
_redis_proxy: RedisProxy = redis_client
_reputation_repository: ReputationRepository = InMemoryReputationRepository()
_reputation_service = ReputationService(repository=_reputation_repository)
_restriction_repository: RestrictionRepository = InMemoryRestrictionRepository()
_velocity_config: VelocityConfig = default_velocity_config()
_velocity_service = VelocityService(redis=_redis_proxy, config=_velocity_config)
_restriction_service = RestrictionService(repository=_restriction_repository, redis=_redis_proxy)
_linkage_repository: LinkageRepository = InMemoryLinkageRepository()
_linkage_service = LinkageService(repository=_linkage_repository)
_ip_repository: IpReputationRepository = InMemoryIpReputationRepository()
_ip_enrichment_service = IpEnrichmentService(repository=_ip_repository)
_reputation_config: ReputationConfig | None = None
_write_gate: WriteGateV2 = WriteGateV2(
	reputation=_reputation_service,
	restrictions=_restriction_service,
	velocity=_velocity_service,
)
_actions_catalog_service: ActionsCatalogService | None = None
_guard_evaluator: "GuardEvaluator" | None = None
_batch_job_scheduler: "BatchJobScheduler" | None = None
_bundle_service: "BundleService" | None = None
_revert_registry: "RevertRegistry" | None = None
_admin_tools_executor: "AdminToolsExecutor" | None = None
_subject_resolver: SubjectResolver = CommunitiesSubjectResolver()
_case_service = CaseService(
    repository=_repository,
    enforcer=_enforcer,
    trust=_trust_ledger,
    redis=_redis_proxy,
    subject_resolver=_subject_resolver,
    notifications=_notifications,
    staff_recipient_ids=_staff_ids,
)
_safety_repository: SafetyRepository = InMemorySafetyRepository()
_thresholds: ModerationThresholds = ModerationThresholds.default()


def configure(
    *,
    repository: Optional[ModerationRepository] = None,
    trust_repository: Optional[TrustRepository] = None,
    detectors: Optional[DetectorSuite] = None,
    hooks: Optional[EnforcementHooks] = None,
    policy: Optional[Policy] = None,
    redis_proxy: Optional[RedisProxy] = None,
    subject_resolver: Optional[SubjectResolver] = None,
    notifications: Optional[NotificationService] = None,
    staff_recipient_ids: Optional[Sequence[str]] = None,
    safety_repository: Optional[SafetyRepository] = None,
    thresholds: Optional[ModerationThresholds] = None,
    reputation_repository: Optional[ReputationRepository] = None,
    restriction_repository: Optional[RestrictionRepository] = None,
    velocity_config: Optional[VelocityConfig] = None,
    linkage_repository: Optional[LinkageRepository] = None,
    ip_repository: Optional[IpReputationRepository] = None,
    reputation_service: Optional[ReputationService] = None,
    restriction_service: Optional[RestrictionService] = None,
    velocity_service: Optional[VelocityService] = None,
    linkage_service: Optional[LinkageService] = None,
    ip_enrichment_service: Optional[IpEnrichmentService] = None,
    reputation_config: Optional[ReputationConfig] = None,
    actions_catalog_service: Optional[ActionsCatalogService] = None,
) -> None:
    global _repository, _trust_repo, _trust_ledger, _hooks, _detectors, _policy, _enforcer, _redis_proxy, _subject_resolver, _notifications, _staff_ids, _case_service, _safety_repository, _thresholds
    global _reputation_repository, _reputation_service, _restriction_repository, _restriction_service, _velocity_config, _velocity_service
    global _linkage_repository, _linkage_service, _ip_repository, _ip_enrichment_service
    global _reputation_config, _write_gate, _actions_catalog_service
    global _guard_evaluator, _batch_job_scheduler, _bundle_service, _revert_registry, _admin_tools_executor
    if repository is not None:
        _repository = repository
    if trust_repository is not None:
        _trust_repo = trust_repository
    if detectors is not None:
        _detectors = detectors
    else:
        _detectors = DetectorSuite()
    if hooks is not None:
        _hooks = hooks
    if policy is not None:
        _policy = policy
    _redis_proxy = redis_proxy or _redis_proxy
    _subject_resolver = subject_resolver or _subject_resolver
    if notifications is not None:
        _notifications = notifications
    if staff_recipient_ids is not None:
        _staff_ids = tuple(staff_recipient_ids)
    if safety_repository is not None:
        _safety_repository = safety_repository
    if thresholds is not None:
        _thresholds = thresholds
    if reputation_config is not None:
        _reputation_config = reputation_config
        _velocity_config = reputation_config.velocity_config
    if reputation_repository is not None:
        _reputation_repository = reputation_repository
    if restriction_repository is not None:
        _restriction_repository = restriction_repository
    if velocity_config is not None:
        _velocity_config = velocity_config
    if linkage_repository is not None:
        _linkage_repository = linkage_repository
    if ip_repository is not None:
        _ip_repository = ip_repository
    _redis_proxy = redis_proxy or _redis_proxy
    _trust_ledger = TrustLedger(repository=_trust_repo)
    _enforcer = ModerationEnforcer(repository=_repository, hooks=_hooks)
    _case_service = CaseService(
        repository=_repository,
        enforcer=_enforcer,
        trust=_trust_ledger,
        redis=_redis_proxy,
        subject_resolver=_subject_resolver,
        notifications=_notifications,
        staff_recipient_ids=_staff_ids,
    )
    _reputation_service = reputation_service or ReputationService(repository=_reputation_repository)
    _velocity_service = velocity_service or VelocityService(redis=_redis_proxy, config=_velocity_config)
    _restriction_service = restriction_service or RestrictionService(
        repository=_restriction_repository,
        redis=_redis_proxy,
    )
    _linkage_service = linkage_service or LinkageService(repository=_linkage_repository)
    _ip_enrichment_service = ip_enrichment_service or IpEnrichmentService(repository=_ip_repository)

    config_for_gate = _reputation_config
    _write_gate = WriteGateV2(
        reputation=_reputation_service,
        restrictions=_restriction_service,
        velocity=_velocity_service,
        shadow_ttl_hours=config_for_gate.shadow_ttl_hours if config_for_gate else 24,
        captcha_ttl_hours=config_for_gate.captcha_ttl_hours if config_for_gate else 24,
        honey_shadow_hours=config_for_gate.honey_shadow_hours if config_for_gate else None,
        honey_captcha_hours=config_for_gate.honey_captcha_hours if config_for_gate else None,
        link_cooloff_hours=config_for_gate.link_cooloff_hours if config_for_gate else 24,
    )
    if actions_catalog_service is not None:
        _actions_catalog_service = actions_catalog_service


def configure_postgres(
    pool: asyncpg.Pool,
    redis_conn: Redis | RedisProxy,
    *,
    hooks: Optional[EnforcementHooks] = None,
    policy: Optional[Policy] = None,
    safety_thresholds_path: Optional[str] = None,
    reputation_config_path: Optional[str] = None,
) -> None:
    repo = PostgresModerationRepository(pool)
    trust_repo = PostgresTrustRepository(pool)
    detectors = DetectorSuite.from_redis(redis_conn)
    if hooks is None:
        hooks = CommunitiesEnforcementHooks()
    proxy = redis_conn if isinstance(redis_conn, RedisProxy) else RedisProxy(redis_conn)
    safety_repo = PostgresSafetyRepository(pool)
    thresholds = load_thresholds(safety_thresholds_path) if safety_thresholds_path else None
    reputation_repo = PostgresReputationRepository(pool)
    restriction_repo = PostgresRestrictionRepository(pool)
    linkage_repo = PostgresLinkageRepository(pool)
    ip_repo = PostgresIpReputationRepository(pool)
    reputation_config = load_reputation_config(reputation_config_path) if reputation_config_path else None
    velocity_override = reputation_config.velocity_config if reputation_config is not None else None
    catalog_service = ActionsCatalogService(pool=pool, audit_repo=repo)
    configure(
        repository=repo,
        trust_repository=trust_repo,
        detectors=detectors,
        hooks=hooks,
        policy=policy,
        redis_proxy=proxy,
        subject_resolver=CommunitiesSubjectResolver(),
        safety_repository=safety_repo,
        thresholds=thresholds,
        reputation_repository=reputation_repo,
        restriction_repository=restriction_repo,
        velocity_config=velocity_override,
        linkage_repository=linkage_repo,
        ip_repository=ip_repo,
        reputation_config=reputation_config,
        actions_catalog_service=catalog_service,
    )
    from app.moderation.domain.tools.bundle_io import BundleService
    from app.moderation.domain.tools.executor import AdminToolsExecutor
    from app.moderation.domain.tools.guards import GuardEvaluator
    from app.moderation.domain.tools.jobs import BatchJobScheduler
    from app.moderation.domain.tools.revertors import RevertRegistry

    global _batch_job_scheduler, _guard_evaluator, _bundle_service, _revert_registry, _admin_tools_executor
    scheduler = BatchJobScheduler(pool=pool)
    guard_evaluator = GuardEvaluator()
    bundle_service = BundleService(catalog=catalog_service)
    revert_registry = _revert_registry or _build_default_revert_registry()

    _batch_job_scheduler = scheduler
    _guard_evaluator = guard_evaluator
    _bundle_service = bundle_service
    _revert_registry = revert_registry
    _admin_tools_executor = AdminToolsExecutor(
        catalog=catalog_service,
        scheduler=_batch_job_scheduler,
        guard=_guard_evaluator,
        bundle_service=_bundle_service,
        revert_registry=_revert_registry,
        case_service=_case_service,
        enforcer=_enforcer,
        repository=_repository,
    )


def get_repository() -> ModerationRepository:
    return _repository


def get_trust_ledger() -> TrustLedger:
    return _trust_ledger


def get_enforcer() -> ModerationEnforcer:
    return _enforcer


def get_policy() -> Policy:
    return _policy


def get_detectors() -> DetectorSuite:
    return _detectors


def get_case_service() -> CaseService:
    return _case_service


def get_safety_repository() -> SafetyRepository:
    return _safety_repository


def get_thresholds() -> ModerationThresholds:
    return _thresholds


def configure_thresholds_from_file(path: str) -> None:
    configure(thresholds=load_thresholds(path))


def get_reputation_service() -> ReputationService:
    return _reputation_service


def get_velocity_service() -> VelocityService:
    return _velocity_service


def get_restriction_service() -> RestrictionService:
    return _restriction_service


def get_linkage_service() -> LinkageService:
    return _linkage_service


def get_ip_enrichment_service() -> IpEnrichmentService:
    return _ip_enrichment_service


def get_write_gate() -> WriteGateV2:
    return _write_gate


def get_reputation_config() -> ReputationConfig | None:
    return _reputation_config


def get_actions_catalog_service_instance() -> ActionsCatalogService:
    if _actions_catalog_service is None:
        raise RuntimeError("ActionsCatalogService not configured")
    return _actions_catalog_service


def get_guard_evaluator_instance() -> "GuardEvaluator":
    global _guard_evaluator
    if _guard_evaluator is None:
        from app.moderation.domain.tools.guards import GuardEvaluator

        _guard_evaluator = GuardEvaluator()
    return _guard_evaluator


def get_batch_job_scheduler_instance() -> "BatchJobScheduler":
    global _batch_job_scheduler
    if _batch_job_scheduler is None:
        from app.moderation.domain.tools.jobs import BatchJobScheduler

        _batch_job_scheduler = BatchJobScheduler()
    return _batch_job_scheduler


def get_bundle_service_instance() -> "BundleService":
    global _bundle_service
    if _bundle_service is None:
        from app.moderation.domain.tools.bundle_io import BundleService

        _bundle_service = BundleService(catalog=get_actions_catalog_service_instance())
    return _bundle_service


def get_revert_registry_instance() -> "RevertRegistry":
    global _revert_registry
    if _revert_registry is None:
        _revert_registry = _build_default_revert_registry()
    return _revert_registry


def get_admin_tools_executor_instance() -> "AdminToolsExecutor":
    global _admin_tools_executor
    if _admin_tools_executor is None:
        from app.moderation.domain.tools.executor import AdminToolsExecutor

        _admin_tools_executor = AdminToolsExecutor(
            catalog=get_actions_catalog_service_instance(),
            scheduler=get_batch_job_scheduler_instance(),
            guard=get_guard_evaluator_instance(),
            bundle_service=get_bundle_service_instance(),
            revert_registry=get_revert_registry_instance(),
            case_service=_case_service,
            enforcer=_enforcer,
            repository=_repository,
        )
    return _admin_tools_executor


def _build_default_revert_registry() -> "RevertRegistry":
    from app.communities.domain import repo as communities_repo
    from app.moderation.domain.tools.revertors import (
        ContentRestorer,
        NotificationBroadcaster,
        build_default_registry,
    )

    restorer = ContentRestorer(repository=communities_repo.CommunitiesRepository())
    subject_resolver = getattr(_case_service, "subject_resolver", None)
    notifications = getattr(_case_service, "notifications", None)
    notifier = NotificationBroadcaster(subject_resolver=subject_resolver, notifications=notifications)
    return build_default_registry(
        moderation_repo=_repository,
        content_restorer=restorer,
        notifier=notifier,
    )
