#!/usr/bin/env python3
"""
Generate Secure Random Secrets

Generates cryptographically secure random values for all required secrets.
Run this script and copy the output to your .env file.

Usage:
    python scripts/generate_secrets.py
"""

import secrets


def generate_secrets():
    """Generate all required secrets."""
    print("# ============================================")
    print("# GENERATED SECRETS - Copy to .env file")
    print("# ============================================")
    print()
    print(f"SECRET_KEY={secrets.token_urlsafe(32)}")
    print(f"SERVICE_SIGNING_KEY={secrets.token_urlsafe(32)}")
    print(f"REFRESH_PEPPER={secrets.token_urlsafe(32)}")
    print()
    print("# Database")
    print(f"POSTGRES_PASSWORD={secrets.token_urlsafe(16)}")
    print()
    print("# ============================================")
    print("# IMPORTANT: Add these to your .env file")
    print("# ============================================")


if __name__ == "__main__":
    generate_secrets()
