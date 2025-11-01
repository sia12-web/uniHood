import pytest

from app.domain.rooms import policy


@pytest.mark.parametrize(
    "preset,expected",
    [("2-4", 4), ("4-6", 6), ("12+", 48)],
)
def test_preset_to_capacity(preset, expected):
    assert policy.preset_to_capacity(preset) == expected


@pytest.mark.asyncio
async def test_enforce_create_limit(fake_redis):
    user_id = "user-test"
    for _ in range(10):
        await policy.enforce_create_limit(user_id)
    with pytest.raises(policy.RoomPolicyError):
        await policy.enforce_create_limit(user_id)


@pytest.mark.asyncio
async def test_enforce_send_limit(fake_redis):
    user_id = "user-send"
    for _ in range(60):
        await policy.enforce_send_limit(user_id)
    with pytest.raises(policy.RoomPolicyError):
        await policy.enforce_send_limit(user_id)
