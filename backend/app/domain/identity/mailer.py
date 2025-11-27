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
        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user,
            password=settings.smtp_password,
            use_tls=settings.smtp_tls,
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
    # Construct verification link (assuming frontend URL structure)
    # Ideally this should be passed in or configured
    verify_url = f"http://localhost:3000/verify-email?token={token}"
    
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
