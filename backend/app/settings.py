"""Settings for Divan backend with observability configuration."""

from __future__ import annotations

from typing import Optional

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
    postgres_url: str = "postgresql://postgres:postgres@localhost:5432/divan"
    secret_key: str = "dev"
    campus_ttl_seconds: int = 90
    # Presence entries older than this are considered stale and ignored by Nearby
    presence_stale_seconds: int = 20
    # Keepalive loop interval and idle timeout for "go live" sessions
    presence_keepalive_interval_seconds: float = 15.0
    presence_keepalive_idle_seconds: float = 240.0
    # When users select a very small UI radius (e.g., 10m), expand the server-side
    # search slightly to account for GPS jitter. If radius_m <= 10, use this value.
    proximity_min_search_radius_10m: int = 15
    search_backend: str = "postgres"
    webauthn_rp_id: str = _env_field("localhost", "WEBAUTHN_RP_ID")
    webauthn_rp_name: str = _env_field("Divan", "WEBAUTHN_RP_NAME")
    webauthn_origin: str = _env_field("http://localhost:3000", "WEBAUTHN_ORIGIN")

    environment: str = _env_field("dev", "ENV", "APP_ENV", "ENVIRONMENT")
    obs_enabled: bool = _env_field(True, "OBS_ENABLED")
    obs_metrics_public: bool = _env_field(False, "OBS_METRICS_PUBLIC")
    obs_tracing_enabled: bool = _env_field(False, "OBS_TRACING_ENABLED")
    obs_log_level: str = _env_field("INFO", "LOG_LEVEL")
    obs_log_sampling_rate_info: float = _env_field(0.1, "LOG_SAMPLING_RATE_INFO")
    otel_exporter_otlp_endpoint: Optional[str] = _env_field(None, "OTEL_EXPORTER_OTLP_ENDPOINT")
    health_min_migration: str = _env_field("0001", "HEALTH_MIN_MIGRATION")
    obs_admin_token: Optional[str] = _env_field(None, "OBS_ADMIN_TOKEN")
    service_name: str = _env_field("divan-api", "SERVICE_NAME")
    git_commit: str = _env_field("unknown", "GIT_COMMIT", "COMMIT_SHA", "SOURCE_VERSION")
    oauth_google_client_id: Optional[str] = _env_field(None, "OAUTH_GOOGLE_CLIENT_ID")
    oauth_microsoft_client_id: Optional[str] = _env_field(None, "OAUTH_MICROSOFT_CLIENT_ID")
    oauth_redirect_base: Optional[str] = _env_field(None, "OAUTH_REDIRECT_BASE")
    communities_workers_enabled: bool = _env_field(False, "COMMUNITIES_WORKERS_ENABLED")
    moderation_workers_enabled: bool = _env_field(False, "MODERATION_WORKERS_ENABLED")
    moderation_staff_ids: tuple[str, ...] = _env_field((), "MODERATION_STAFF_IDS")

    if PYDANTIC_V2:
        model_config = SettingsConfigDict(
            env_prefix="",
            env_file=".env",
            case_sensitive=False,
            env_nested_delimiter="__",
        )
        @field_validator("moderation_staff_ids", mode="before")
        def _split_staff_ids(cls, value):  # type: ignore[override]
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


def _normalise_level(level: str) -> str:
    return level.upper()


settings = Settings()
settings.obs_log_level = _normalise_level(settings.obs_log_level)
