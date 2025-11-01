from app.domain.proximity.models import PrivacySettings


def test_everyone_visibility_allows_all():
    settings = PrivacySettings(visibility="everyone", ghost_mode=False)
    assert settings.allows_visibility(is_friend=False)


def test_friends_visibility_denies_non_friends():
    settings = PrivacySettings(visibility="friends", ghost_mode=False)
    assert not settings.allows_visibility(is_friend=False)
    assert settings.allows_visibility(is_friend=True)


def test_ghost_mode_blocks_everyone():
    settings = PrivacySettings(ghost_mode=True)
    assert not settings.allows_visibility(is_friend=True)
