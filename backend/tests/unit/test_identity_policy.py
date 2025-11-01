import asyncio
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.domain.identity import policy


@pytest.mark.parametrize(
    "email,domain",
    [
        ("user@utoronto.ca", "utoronto.ca"),
        ("User@Example.edu", "example.edu"),
    ],
)
def test_guard_email_domain_ok(email, domain):
    campus = SimpleNamespace(domain=domain)
    policy.guard_email_domain(email, campus)


def test_guard_email_domain_mismatch():
    campus = SimpleNamespace(domain="utoronto.ca")
    with pytest.raises(policy.EmailDomainMismatch):
        policy.guard_email_domain("user@gmail.com", campus)


@pytest.mark.parametrize("handle", ["Admin", "bad!handle", "ab"])
def test_guard_handle_format_invalid(handle):
    with pytest.raises(policy.HandleFormatError):
        policy.guard_handle_format(handle.lower())


@pytest.mark.asyncio
async def test_reserve_handle_blocks_duplicates(fake_redis):
    handle = "unique_handle"
    user_id = str(uuid4())
    await policy.reserve_handle(handle, user_id)
    with pytest.raises(policy.HandleConflict):
        await policy.reserve_handle(handle, str(uuid4()))


@pytest.mark.asyncio
async def test_register_rate_limit(fake_redis):
    ip = "127.0.0.1"
    for _ in range(policy.REGISTER_PER_HOUR):
        await policy.enforce_register_rate(ip)
    with pytest.raises(policy.IdentityRateLimitExceeded):
        await policy.enforce_register_rate(ip)


def test_validate_profile_patch_accepts_extended_fields():
    payload = {
        "major": "Computer Science",
        "graduation_year": 2026,
        "passions": ["Hackathons", "Product Design", "Campus Builders"],
    }
    policy.validate_profile_patch(payload)

def test_validate_profile_patch_rejects_bad_year():
    with pytest.raises(policy.IdentityPolicyError):
        policy.validate_profile_patch({"graduation_year": 1500})

def test_validate_profile_patch_rejects_duplicate_passions():
    with pytest.raises(policy.IdentityPolicyError):
        policy.validate_profile_patch({"passions": ["AI", "ai"]})

def test_validate_profile_patch_rejects_long_major():
    with pytest.raises(policy.IdentityPolicyError):
        policy.validate_profile_patch({"major": "x" * (policy.MAJOR_MAX_LEN + 1)})
