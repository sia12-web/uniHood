from __future__ import annotations

from http.cookies import Morsel, SimpleCookie
from typing import Dict, List

import pytest
from fastapi import Response

from app.infra.cookies import (
    FINGERPRINT_COOKIE_NAME,
    FINGERPRINT_PATH,
    REFRESH_COOKIE_NAME,
    REFRESH_COOKIE_PATH,
    clear_refresh_cookies,
    set_refresh_cookies,
)
from app.settings import settings


def _parse_set_cookie_headers(headers: List[str]) -> Dict[str, Morsel]:
    jar = SimpleCookie()
    for header in headers:
        jar.load(header)
    return {name: morsel for name, morsel in jar.items()}


@pytest.mark.asyncio
async def test_request_id_header_present(api_client):
    response = await api_client.get("/health/live")
    assert response.status_code == 200
    request_id = response.headers.get("x-request-id")
    assert request_id


@pytest.mark.asyncio
async def test_request_id_reflected_in_error_body(api_client):
    response = await api_client.post("/health/live")
    assert response.status_code == 405
    header_request_id = response.headers.get("x-request-id")
    assert header_request_id
    body = response.json()
    assert body["request_id"] == header_request_id
    assert body["detail"]


def test_refresh_cookies_set_security_flags():
    response = Response()
    set_refresh_cookies(response, refresh_token="rt-token", rf_fp="fingerprint")

    cookie_headers = response.headers.getlist("set-cookie")
    assert len(cookie_headers) == 2
    cookies = _parse_set_cookie_headers(cookie_headers)

    refresh_cookie = cookies[REFRESH_COOKIE_NAME]
    assert refresh_cookie["path"] == REFRESH_COOKIE_PATH
    assert refresh_cookie["httponly"] is True
    assert refresh_cookie["samesite"] == "Lax"
    assert not refresh_cookie["secure"]
    expected_max_age = str(settings.refresh_ttl_days * 24 * 60 * 60)
    assert refresh_cookie["max-age"] == expected_max_age

    fingerprint_cookie = cookies[FINGERPRINT_COOKIE_NAME]
    assert fingerprint_cookie["path"] == FINGERPRINT_PATH
    assert not fingerprint_cookie["httponly"]
    assert fingerprint_cookie["samesite"] == "Lax"
    assert not fingerprint_cookie["secure"]
    assert fingerprint_cookie["max-age"] == expected_max_age


def test_refresh_cookies_can_be_cleared():
    response = Response()
    clear_refresh_cookies(response)

    cookie_headers = response.headers.getlist("set-cookie")
    assert len(cookie_headers) == 2
    assert all("Max-Age=0" in header for header in cookie_headers)
