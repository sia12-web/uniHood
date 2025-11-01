import pytest

from app.domain.social import policy
from app.domain.social.exceptions import BlockLimitExceeded, InviteRateLimitExceeded, InviteSelfError
from app.domain.social.models import BLOCK_PER_MINUTE, INVITE_PER_MINUTE


@pytest.mark.asyncio
async def test_enforce_invite_limits_minute(fake_redis):
    user_id = "11111111-1111-1111-1111-111111111111"
    for _ in range(INVITE_PER_MINUTE):
        await policy.enforce_invite_limits(user_id)
    with pytest.raises(InviteRateLimitExceeded):
        await policy.enforce_invite_limits(user_id)


@pytest.mark.asyncio
async def test_enforce_block_limits(fake_redis):
    user_id = "22222222-2222-2222-2222-222222222222"
    for _ in range(BLOCK_PER_MINUTE):
        await policy.enforce_block_limits(user_id)
    with pytest.raises(BlockLimitExceeded):
        await policy.enforce_block_limits(user_id)


def test_guard_not_self():
    with pytest.raises(InviteSelfError):
        policy.guard_not_self("abc", "abc")
