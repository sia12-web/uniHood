"""Centralized password hashing configuration.

This module provides a properly configured PasswordHasher instance
following security best practices per S1-backend-01-authentication.md spec.

All modules requiring password hashing MUST import from here to ensure
consistent, secure parameters across the application.
"""

from argon2 import PasswordHasher

# Argon2id parameters per S1-backend-01-authentication.md
# - Memory: 64 MB (65536 KB)
# - Iterations (time_cost): 3 minimum
# - Parallelism: 4
PASSWORD_HASHER = PasswordHasher(
    time_cost=3,           # Number of iterations
    memory_cost=65536,     # 64 MB in KB
    parallelism=4,         # Parallel threads
    hash_len=32,           # Output hash length in bytes
    salt_len=16,           # Salt length in bytes
)


def hash_password(password: str) -> str:
    """Hash a password using Argon2id with secure parameters."""
    return PASSWORD_HASHER.hash(password)


def verify_password(hash: str, password: str) -> bool:
    """Verify a password against its hash.
    
    Returns True if valid, False otherwise.
    """
    try:
        PASSWORD_HASHER.verify(hash, password)
        return True
    except Exception:
        return False


def check_needs_rehash(hash: str) -> bool:
    """Check if a password hash needs to be upgraded.
    
    Returns True if the hash was created with different (weaker) parameters
    and should be rehashed on next successful login.
    """
    return PASSWORD_HASHER.check_needs_rehash(hash)
