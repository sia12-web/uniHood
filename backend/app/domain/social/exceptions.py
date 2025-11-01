"""Domain-level exceptions for social invites & friendships."""

from __future__ import annotations

from app.infra.rate_limit import RateLimitExceeded


class SocialError(Exception):
    """Base class for social feature errors."""

    reason: str = "unknown"

    def __init__(self, reason: str | None = None) -> None:
        super().__init__(reason or self.reason)
        if reason:
            self.reason = reason


class InviteConflict(SocialError):
    reason = "conflict"


class InviteAlreadySent(InviteConflict):
    reason = "already_sent"


class InviteAlreadyFriends(InviteConflict):
    reason = "already_friends"


class InviteForbidden(SocialError):
    reason = "forbidden"


class InviteNotFound(SocialError):
    reason = "not_found"


class InviteGone(SocialError):
    reason = "gone"


class InviteSelfError(InviteConflict):
    reason = "self_invite"


class InviteBlocked(SocialError):
    reason = "blocked"


class InviteRateLimitExceeded(RateLimitExceeded):
    """Raised when invite sending hits a quota."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class BlockLimitExceeded(RateLimitExceeded):
    """Raised when block operations hit quota."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason
