"""Stub mailer for identity security flows."""

from __future__ import annotations

import logging
from email.message import EmailMessage
import aiosmtplib

from app.domain.identity import audit
from app.settings import settings

logger = logging.getLogger(__name__)


def _hash_email(email: str) -> str:
    import hashlib
    masked = hashlib.sha256(email.lower().encode("utf-8")).hexdigest()
    return masked[:12]


def mask_email(email: str) -> str:
    return _hash_email(email)


async def _send_email(to_email: str, subject: str, body_html: str) -> None:
    """Send an email using configured SMTP settings."""
    if not settings.smtp_host or settings.smtp_host == "localhost" and not settings.is_dev():
        logger.warning("SMTP not configured, skipping email to %s", mask_email(to_email))
        return

    msg = EmailMessage()
    msg["From"] = settings.smtp_from_email
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body_html, subtype="html")

    try:
        # Resend uses STARTTLS on port 587. `use_tls=True` is for implicit TLS (typically port 465).
        # Treat SMTP_TLS=1 as "use TLS" and pick the correct mode based on port.
        start_tls = bool(settings.smtp_tls) and int(settings.smtp_port) == 587
        use_tls = bool(settings.smtp_tls) and int(settings.smtp_port) == 465
        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user,
            password=settings.smtp_password,
            start_tls=start_tls,
            use_tls=use_tls,
        )
        logger.info("Email sent to %s", mask_email(to_email))
    except Exception as e:
        logger.error("Failed to send email to %s: %s", mask_email(to_email), str(e))
        # Don't raise, just log error to avoid breaking auth flow if email fails
        pass


async def send_password_reset(email: str, link: str, *, user_id: str | None = None) -> None:
    """Send a password reset email."""
    subject = "Reset your password"
    body = f"""
    <html>
        <body>
            <p>Hello,</p>
            <p>You requested a password reset. Click the link below to reset your password:</p>
            <p><a href="{link}">Reset Password</a></p>
            <p>If you did not request this, please ignore this email.</p>
        </body>
    </html>
    """
    await _send_email(email, subject, body)
    
    mask = _hash_email(email)
    await audit.log_event(
        "pwreset_email_sent",
        user_id=user_id,
        meta={"email_hash": mask},
    )


async def send_deletion_confirmation(email: str, token: str, *, user_id: str | None = None) -> None:
    subject = "Confirm account deletion"
    body = f"""
    <html>
        <body>
            <p>Hello,</p>
            <p>You requested to delete your account. Use the token below to confirm:</p>
            <p><strong>{token}</strong></p>
            <p>If you did not request this, please ignore this email.</p>
        </body>
    </html>
    """
    await _send_email(email, subject, body)

    mask = _hash_email(email)
    await audit.log_event(
        "delete_email_sent",
        user_id=user_id,
        meta={"email_hash": mask},
    )


async def send_email_change_confirmation(new_email: str, token: str, *, user_id: str | None = None) -> None:
    subject = "Confirm email change"
    body = f"""
    <html>
        <body>
            <p>Hello,</p>
            <p>You requested to change your email. Use the token below to confirm:</p>
            <p><strong>{token}</strong></p>
            <p>If you did not request this, please ignore this email.</p>
        </body>
    </html>
    """
    await _send_email(new_email, subject, body)

    mask = _hash_email(new_email)
    await audit.log_event(
        "email_change_sent",
        user_id=user_id,
        meta={"email_hash": mask},
    )


async def send_email_verification(email: str, token: str, *, user_id: str | None = None) -> None:
    verify_url = f"{settings.public_app_url}/verify/{token}"
    
    subject = "Verify your email"
    body = f"""
    <html>
        <body>
            <p>Welcome!</p>
            <p>Please verify your email address by clicking the link below:</p>
            <p><a href="{verify_url}">Verify Email</a></p>
            <p>Or use this token: <strong>{token}</strong></p>
        </body>
    </html>
    """
    await _send_email(email, subject, body)

    mask = _hash_email(email)
    await audit.log_event(
        "email_verify_sent",
        user_id=user_id,
        meta={"email_hash": mask},
    )


async def send_username_reminder(email: str, handle: str, *, user_id: str | None = None) -> None:
    """Send a username reminder email."""
    subject = "Your username reminder"
    body = f"""
    <html>
        <body>
            <p>Hello,</p>
            <p>You requested a username reminder. Your username is:</p>
            <p><strong>{handle}</strong></p>
            <p>If you did not request this, please ignore this email.</p>
        </body>
    </html>
    """
    await _send_email(email, subject, body)
    
    mask = _hash_email(email)
    await audit.log_event(
        "username_reminder_email_sent",
        user_id=user_id,
        meta={"email_hash": mask},
    )


async def send_friend_invite_notification(
    to_email: str,
    from_display_name: str,
    from_handle: str | None = None,
    *,
    recipient_user_id: str | None = None,
) -> None:
    """Send email notification when someone receives a friend invitation."""
    sender_label = from_display_name
    if from_handle:
        sender_label = f"{from_display_name} (@{from_handle})"
    
    subject = f"{from_display_name} wants to be your friend on Divan"
    body = f"""
    <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f1a38;">
            <div style="max-width: 500px; margin: 0 auto; padding: 24px;">
                <h2 style="color: #2d2a8d; margin-bottom: 16px;">You have a new friend request!</h2>
                <p><strong>{sender_label}</strong> would like to connect with you on Divan.</p>
                <p style="margin: 24px 0;">
                    <a href="{settings.public_app_url}/friends?tab=invites" 
                       style="display: inline-block; background-color: #3b2e7a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600;">
                        View Invitation
                    </a>
                </p>
                <p style="color: #666; font-size: 14px;">
                    Log in to accept or decline this friend request.
                </p>
            </div>
        </body>
    </html>
    """
    await _send_email(to_email, subject, body)
    
    mask = _hash_email(to_email)
    await audit.log_event(
        "friend_invite_email_sent",
        user_id=recipient_user_id,
        meta={"email_hash": mask, "from_display": from_display_name[:20] if from_display_name else None},
    )


async def send_meetup_invitation(
    to_email: str,
    meetup_title: str,
    host_name: str,
    link: str,
    *,
    recipient_user_id: str | None = None,
) -> None:
    """Send email notification for a private meetup invitation."""
    subject = f"{host_name} invited you to a meetup: {meetup_title}"
    body = f"""
    <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f1a38;">
            <div style="max-width: 500px; margin: 0 auto; padding: 24px;">
                <h2 style="color: #2d2a8d; margin-bottom: 16px;">You're invited!</h2>
                <p><strong>{host_name}</strong> has invited you to a private meetup: <strong>{meetup_title}</strong>.</p>
                <p style="margin: 24px 0;">
                    <a href="{link}" 
                       style="display: inline-block; background-color: #3b2e7a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600;">
                        View Meetup
                    </a>
                </p>
                <p style="color: #666; font-size: 14px;">
                    Log in to join the meetup!
                </p>
            </div>
        </body>
    </html>
    """
    await _send_email(to_email, subject, body)
    
    mask = _hash_email(to_email)
    await audit.log_event(
        "meetup_invite_email_sent",
        user_id=recipient_user_id,
        meta={"email_hash": mask, "meetup_title": meetup_title[:20]},
    )
