"""One-off helper to register a Divan user via the local API."""

from __future__ import annotations

import argparse

import httpx

API_URL = "http://localhost:8000"


def register(email: str, password: str, handle: str, campus_id: str) -> None:
    payload = {
        "email": email,
        "password": password,
        "handle": handle,
        "display_name": handle,
        "campus_id": campus_id,
    }
    resp = httpx.post(f"{API_URL}/auth/register", json=payload, timeout=10.0)
    resp.raise_for_status()
    data = resp.json()
    print(f"Registered user {email} with id {data['user_id']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Register a user using the local backend")
    parser.add_argument("email")
    parser.add_argument("password")
    parser.add_argument("handle")
    parser.add_argument("campus_id")
    args = parser.parse_args()
    register(args.email, args.password, args.handle, args.campus_id)


if __name__ == "__main__":
    main()
