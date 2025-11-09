"""Global error handlers ensuring request_id is included in JSON responses."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.request_id import get_request_id


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def http_exc_handler(request: Request, exc: StarletteHTTPException):  # type: ignore[override]
        rid = get_request_id(request)
        payload = {"detail": exc.detail, "request_id": rid}
        return JSONResponse(status_code=exc.status_code, content=payload)

    @app.exception_handler(RequestValidationError)
    async def validation_exc_handler(request: Request, exc: RequestValidationError):  # type: ignore[override]
        rid = get_request_id(request)
        payload = {"detail": "validation_error", "errors": exc.errors(), "request_id": rid}
        return JSONResponse(status_code=422, content=payload)
