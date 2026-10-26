"""Authentication helpers for Fuseki-backed application accounts."""

import base64
import hashlib
import hmac
import json
import os
import secrets
import time

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

JWT_SECRET = os.getenv(
    "EATHEALTHY_JWT_SECRET",
    "development-only-change-this-secret",
).encode("utf-8")
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    """Hash a password with a per-password salt."""
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, 600_000
    )
    return f"pbkdf2_sha256$600000${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify a password against a stored PBKDF2 hash."""
    try:
        algorithm, iterations, salt_hex, digest_hex = stored_hash.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        expected = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iterations),
        )
        return hmac.compare_digest(expected.hex(), digest_hex)
    except (TypeError, ValueError):
        return False


def _encoded(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decoded(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def create_access_token(account_id: str, role: str) -> str:
    """Create a short-lived HMAC-signed JWT-compatible token."""
    header = _encoded(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _encoded(
        json.dumps(
            {
                "sub": account_id,
                "role": role,
                "exp": int(time.time()) + 3600,
            }
        ).encode()
    )
    unsigned = f"{header}.{payload}".encode("ascii")
    signature = _encoded(hmac.new(JWT_SECRET, unsigned, hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"


def current_account(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        bearer_scheme
    ),
) -> dict:
    """Decode and validate the authenticated account token."""
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        header, payload, signature = credentials.credentials.split(".")
        unsigned = f"{header}.{payload}".encode("ascii")
        expected = _encoded(
            hmac.new(JWT_SECRET, unsigned, hashlib.sha256).digest()
        )
        if not hmac.compare_digest(expected, signature):
            raise ValueError("Invalid signature")
        claims = json.loads(_decoded(payload))
        if claims["exp"] < time.time() or claims["role"] not in {
            "client",
            "admin",
        }:
            raise ValueError("Invalid claims")
        return {"id": claims["sub"], "role": claims["role"]}
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired access token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def require_admin(account: dict = Depends(current_account)) -> dict:
    """Require an authenticated administrator."""
    if account["role"] != "admin":
        raise HTTPException(status_code=403, detail="Administrator role required.")
    return account
