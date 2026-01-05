from __future__ import annotations

from fastapi.openapi.utils import get_openapi

from app.settings import settings


def custom_openapi(app):
    def _gen():
        openapi_schema = get_openapi(
            title="uniHood API",
            version=settings.git_commit[:7] if settings.git_commit else "dev",
            description="uniHood backend API",
            routes=app.routes,
        )
        comps = openapi_schema.setdefault("components", {}).setdefault("securitySchemes", {})
        comps["bearerAuth"] = {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}
        openapi_schema["security"] = [{"bearerAuth": []}]
        return openapi_schema

    app.openapi = _gen  # type: ignore[attr-defined]
