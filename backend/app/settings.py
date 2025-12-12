"""Settings for Divan backend with observability configuration."""

from __future__ import annotations

from typing import Any, Optional, Iterable, Tuple, Union

try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
    from pydantic import AliasChoices, Field, field_validator
    PYDANTIC_V2 = True
except ImportError:  # pragma: no cover - fallback for Pydantic v1
    from pydantic import BaseSettings, Field, validator  # type: ignore
    PYDANTIC_V2 = False
    SettingsConfigDict = dict  # type: ignore
    try:
        from pydantic import AliasChoices  # type: ignore
    except ImportError:  # type: ignore
        class AliasChoices:  # pragma: no cover - minimal shim
            def __init__(self, *choices: str) -> None:
                self.choices = choices
    def field_validator(*args, **kwargs):  # type: ignore
        def decorator(func):
            return func
        return decorator


def _env_field(default, *env_names: str):
    if PYDANTIC_V2:
        if env_names:
            alias = AliasChoices(*env_names) if len(env_names) > 1 else env_names[0]
            return Field(default=default, validation_alias=alias)
        return Field(default=default)
    if env_names:
        env_value = list(env_names) if len(env_names) > 1 else env_names[0]
        return Field(default=default, env=env_value)  # type: ignore[arg-type]
    return Field(default=default)


class Settings(BaseSettings):
    redis_url: str = "redis://localhost:6379/0"
    postgres_url: str = _env_field("postgresql://postgres:postgres@127.0.0.1:5432/unihood", "POSTGRES_URL", "DATABASE_URL")
    postgres_min_pool_size: int = _env_field(10, "POSTGRES_MIN_POOL_SIZE")
    postgres_max_pool_size: int = _env_field(50, "POSTGRES_MAX_POOL_SIZE")
    postgres_ssl: bool = _env_field(False, "POSTGRES_SSL")
    secret_key: str = _env_field(..., "SECRET_KEY")
    campus_ttl_seconds: int = 10800  # 3 hours
    default_campus_id: str = _env_field("c4f7d1ec-7b01-4f7b-a1cb-4ef0a1d57ae2", "DEFAULT_CAMPUS_ID")
    # Presence entries older than this are considered stale and ignored by Nearby
    presence_stale_seconds: int = 10800  # 3 hours
    # Keepalive loop interval and idle timeout for "go live" sessions
    presence_keepalive_interval_seconds: float = 15.0
    presence_keepalive_idle_seconds: float = 240.0
    # When users select a very small UI radius (e.g., 10m), expand the server-side
    # search slightly to account for GPS jitter. If radius_m <= 10, use this value.
    proximity_min_search_radius_10m: int = 15
    search_backend: str = "postgres"
    webauthn_rp_id: str = _env_field("localhost", "WEBAUTHN_RP_ID")
    webauthn_rp_name: str = _env_field("uniHood", "WEBAUTHN_RP_NAME")
    webauthn_origin: str = _env_field("http://localhost:3000", "WEBAUTHN_ORIGIN")

    environment: str = _env_field("production", "ENV", "APP_ENV", "ENVIRONMENT")
    obs_enabled: bool = _env_field(True, "OBS_ENABLED")
    obs_metrics_public: bool = _env_field(False, "OBS_METRICS_PUBLIC")
    obs_tracing_enabled: bool = _env_field(False, "OBS_TRACING_ENABLED")
    obs_log_level: str = _env_field("INFO", "LOG_LEVEL")
    obs_log_sampling_rate_info: float = _env_field(0.1, "LOG_SAMPLING_RATE_INFO")
    otel_exporter_otlp_endpoint: Optional[str] = _env_field(None, "OTEL_EXPORTER_OTLP_ENDPOINT")
    health_min_migration: str = _env_field("0001", "HEALTH_MIN_MIGRATION")
    obs_admin_token: Optional[str] = _env_field(None, "OBS_ADMIN_TOKEN")
    service_name: str = _env_field("unihood-api", "SERVICE_NAME")
    git_commit: str = _env_field("unknown", "GIT_COMMIT", "COMMIT_SHA", "SOURCE_VERSION")
    oauth_google_client_id: Optional[str] = _env_field(None, "OAUTH_GOOGLE_CLIENT_ID")
    oauth_microsoft_client_id: Optional[str] = _env_field(None, "OAUTH_MICROSOFT_CLIENT_ID")
    oauth_redirect_base: Optional[str] = _env_field(None, "OAUTH_REDIRECT_BASE")
    communities_workers_enabled: bool = _env_field(False, "COMMUNITIES_WORKERS_ENABLED")
    moderation_workers_enabled: bool = _env_field(False, "MODERATION_WORKERS_ENABLED")
    moderation_staff_ids: Union[str, Tuple[str, ...]] = _env_field((), "MODERATION_STAFF_IDS")
    idempotency_required: bool = _env_field(True, "IDEMPOTENCY_REQUIRED")
    idempotency_ttl_seconds: int = _env_field(86400, "IDEMPOTENCY_TTL_SECONDS")

    # Phase E: Signed intents and security
    intent_signing_required: bool = _env_field(True, "INTENT_SIGNING_REQUIRED")
    intent_allowed_skew_seconds: int = _env_field(60, "INTENT_ALLOWED_SKEW_SECONDS")
    intent_nonce_ttl_seconds: int = _env_field(600, "INTENT_NONCE_TTL_SECONDS")
    service_signing_key: str = _env_field(..., "SERVICE_SIGNING_KEY")

    # Security/cross-origin and auth cookie knobs
    cors_allow_origins: Any = _env_field((), "CORS_ALLOW_ORIGINS")
    access_ttl_minutes: int = _env_field(60, "ACCESS_TTL_MINUTES")
    refresh_ttl_days: int = _env_field(30, "REFRESH_TTL_DAYS")
    refresh_pepper: str = _env_field(..., "REFRESH_PEPPER")
    cookie_secure: bool = _env_field(False, "COOKIE_SECURE")
    cookie_samesite: str = _env_field("strict", "COOKIE_SAMESITE")
    cookie_domain: Optional[str] = _env_field(None, "COOKIE_DOMAIN")

    # Email Settings
    smtp_host: str = _env_field("localhost", "SMTP_HOST")
    smtp_port: int = _env_field(1025, "SMTP_PORT")
    smtp_user: Optional[str] = _env_field(None, "SMTP_USER")
    smtp_password: Optional[str] = _env_field(None, "SMTP_PASSWORD")
    smtp_from_email: str = _env_field("noreply@example.com", "SMTP_FROM_EMAIL")
    smtp_tls: bool = _env_field(False, "SMTP_TLS")

    # Environment helpers
    def is_prod(self) -> bool:
        return self.environment.lower() in ("prod", "production", "live")

    def is_dev(self) -> bool:
        return self.environment.lower() in ("dev", "development")

    if PYDANTIC_V2:
        model_config = SettingsConfigDict(
            env_prefix="",
            env_file=".env",
            case_sensitive=False,
            env_nested_delimiter="__",
        )
        @field_validator("moderation_staff_ids", mode="before")
        def _split_staff_ids(cls, value):  # type: ignore[override]
            """Normalise env/JSON formats for moderation_staff_ids.

            Supports:
            - empty / missing -> ()
            - comma-separated string -> tuple of IDs
            - JSON string (e.g. '["id1","id2"]') -> tuple of IDs
            - list / tuple / set -> tuple of IDs
            Any parsing error falls back to empty tuple instead of crashing.
            """
            if value in (None, ""):
                return ()
            # If pydantic-settings already decoded JSON into a Python list/tuple/set
            if isinstance(value, (list, tuple, set)):
                return tuple(str(item).strip() for item in value if str(item).strip())
            if isinstance(value, str):
                text = value.strip()
                if not text:
                    return ()
                # Try JSON first
                if text.startswith("[") or text.startswith("{"):
                    import json

                    try:
                        data = json.loads(text)
                        if isinstance(data, (list, tuple, set)):
                            return tuple(str(item).strip() for item in data if str(item).strip())
                    except Exception:
                        # Fall back to comma-separated parsing below
                        pass
                # Fallback: comma-separated string
                return tuple(part.strip() for part in text.split(",") if part.strip())
            return ()
        @field_validator("cors_allow_origins", mode="before")
        def _split_cors(cls, value):  # type: ignore[override]
            if value in (None, ""):
                return ()
            if isinstance(value, str):
                return tuple(part.strip() for part in value.split(",") if part.strip())
            if isinstance(value, (list, tuple, set)):
                return tuple(str(item).strip() for item in value if str(item).strip())
            return ()
    else:  # pragma: no cover - legacy Pydantic v1 support
        class Config:
            env_prefix = ""
            env_file = ".env"
            case_sensitive = False
            env_nested_delimiter = "__"

        @validator("moderation_staff_ids", pre=True)  # type: ignore[override]
        def _split_staff_ids_v1(cls, value):
            if value in (None, ""):
                return ()
            if isinstance(value, str):
                return tuple(part.strip() for part in value.split(",") if part.strip())
            if isinstance(value, (list, tuple, set)):
                return tuple(str(item).strip() for item in value if str(item).strip())
            return ()
        @validator("cors_allow_origins", pre=True)  # type: ignore[override]
        def _split_cors_v1(cls, value):
            if value in (None, ""):
                return ()
            if isinstance(value, str):
                return tuple(part.strip() for part in value.split(",") if part.strip())
            if isinstance(value, (list, tuple, set)):
                return tuple(str(item).strip() for item in value if str(item).strip())
            return ()


def _normalise_level(level: str) -> str:
    return level.upper()


settings = Settings()
settings.obs_log_level = _normalise_level(settings.obs_log_level)


# Convenience helpers
def is_true(value: str | bool | None) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _env_is(value: str, *aliases: Iterable[str]) -> bool:
    v = value.lower().strip()
    return v in ("dev", "development") if not aliases else v in set(aliases)


def _settings_is(env: str) -> bool:
    return settings.environment.lower() in (env,)


def _is_any(*envs: str) -> bool:
    return settings.environment.lower() in {e.lower() for e in envs}


# (Deprecated) Back-compat helpers can be added here if needed
