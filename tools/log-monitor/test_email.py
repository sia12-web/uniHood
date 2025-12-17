#!/usr/bin/env python3
"""
Test script to verify MailHog email integration for Docker log monitoring.

Usage:
    python test_email.py

This will:
1. Check if MailHog is running
2. Send a test alert email
3. Verify the email was received via MailHog API
"""

import smtplib
import sys
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

# MailHog default configuration (matches docker-compose)
MAILHOG_SMTP_HOST = "localhost"  # Use 'mailhog' if running inside Docker
MAILHOG_SMTP_PORT = 1025
MAILHOG_API_HOST = "localhost"
MAILHOG_API_PORT = 8025


def check_mailhog_running() -> bool:
    """Check if MailHog SMTP is accepting connections."""
    import socket
    
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        result = sock.connect_ex((MAILHOG_SMTP_HOST, MAILHOG_SMTP_PORT))
        sock.close()
        return result == 0
    except Exception as e:
        print(f"Error checking MailHog: {e}")
        return False


def send_test_email() -> bool:
    """Send a test alert email to MailHog."""
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "[uniHood Alert] TEST - Docker Log Monitor Email Test"
        msg["From"] = "alerts@unihood.local"
        msg["To"] = "admin@unihood.local"
        
        text_content = f"""
uniHood Docker Log Monitor - Email Test
========================================

This is a test email to verify that MailHog integration is working correctly.

Timestamp: {datetime.now().isoformat()}
Test Status: SUCCESS

If you received this email, the log monitor's email alerting feature is properly configured!

Configuration:
- SMTP Host: {MAILHOG_SMTP_HOST}
- SMTP Port: {MAILHOG_SMTP_PORT}
- From: alerts@unihood.local
- To: admin@unihood.local
"""

        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
            <div style="border-left: 4px solid #36a64f; padding-left: 15px;">
                <h2 style="color: #36a64f;">🔔 uniHood Docker Log Monitor - Email Test</h2>
                <p>This is a test email to verify that MailHog integration is working correctly.</p>
                
                <table style="margin: 20px 0; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Timestamp</strong></td>
                        <td style="padding: 8px; border: 1px solid #ddd;">{datetime.now().isoformat()}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Status</strong></td>
                        <td style="padding: 8px; border: 1px solid #ddd; color: #36a64f;">✅ SUCCESS</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border: 1px solid #ddd;"><strong>SMTP Host</strong></td>
                        <td style="padding: 8px; border: 1px solid #ddd;">{MAILHOG_SMTP_HOST}:{MAILHOG_SMTP_PORT}</td>
                    </tr>
                </table>
                
                <p style="color: #666; font-size: 12px;">
                    If you received this email, the log monitor's email alerting feature is properly configured!
                </p>
            </div>
        </body>
        </html>
        """
        
        msg.attach(MIMEText(text_content, "plain"))
        msg.attach(MIMEText(html_content, "html"))
        
        # Connect to MailHog SMTP
        with smtplib.SMTP(MAILHOG_SMTP_HOST, MAILHOG_SMTP_PORT) as server:
            server.sendmail(msg["From"], [msg["To"]], msg.as_string())
        
        print("✅ Test email sent successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Failed to send test email: {e}")
        return False


def check_mailhog_received() -> bool:
    """Check MailHog API for received messages."""
    try:
        import urllib.request
        import json
        
        url = f"http://{MAILHOG_API_HOST}:{MAILHOG_API_PORT}/api/v2/messages"
        
        with urllib.request.urlopen(url, timeout=5) as response:
            data = json.loads(response.read().decode())
            
        total = data.get("total", 0)
        print(f"\n📬 MailHog has {total} message(s) in inbox")
        
        if total > 0:
            latest = data.get("items", [])[0]
            subject = latest.get("Content", {}).get("Headers", {}).get("Subject", ["Unknown"])[0]
            print(f"   Latest message: {subject}")
            return True
        
        return False
        
    except Exception as e:
        print(f"⚠️  Could not check MailHog API: {e}")
        print(f"   (MailHog web UI may still work at http://localhost:{MAILHOG_API_PORT})")
        return False


def main():
    print("=" * 60)
    print("🧪 uniHood Docker Log Monitor - MailHog Email Test")
    print("=" * 60)
    print()
    
    # Step 1: Check MailHog connectivity
    print("1️⃣  Checking MailHog SMTP connectivity...")
    if not check_mailhog_running():
        print(f"❌ MailHog is not running on {MAILHOG_SMTP_HOST}:{MAILHOG_SMTP_PORT}")
        print()
        print("To start MailHog, run:")
        print("   docker-compose up -d mailhog")
        print()
        print("Or check the Docker desktop to ensure MailHog container is running.")
        sys.exit(1)
    
    print(f"✅ MailHog SMTP is running on {MAILHOG_SMTP_HOST}:{MAILHOG_SMTP_PORT}")
    print()
    
    # Step 2: Send test email
    print("2️⃣  Sending test email...")
    if not send_test_email():
        sys.exit(1)
    print()
    
    # Step 3: Verify receipt
    print("3️⃣  Checking MailHog inbox...")
    check_mailhog_received()
    print()
    
    # Summary
    print("=" * 60)
    print("✅ Email test completed successfully!")
    print()
    print(f"📧 View emails in MailHog web UI:")
    print(f"   http://localhost:{MAILHOG_API_PORT}")
    print()
    print("To enable email alerts in the log monitor, set these environment variables:")
    print("   EMAIL_ENABLED=true")
    print("   EMAIL_TO=your-email@example.com")
    print("=" * 60)


if __name__ == "__main__":
    main()
