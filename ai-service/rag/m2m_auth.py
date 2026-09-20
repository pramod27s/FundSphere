"""
==============================================================================
Machine-to-Machine (M2M) Authentication Module (Level 2 Security)
==============================================================================

HOW THIS WORKS (Simple Explanation):
1. ASYMMETRIC ENCRYPTION (RSA 2048 / RS256):
   - Spring Boot signs every request using its PRIVATE key.
   - This Python AI service only needs the PUBLIC key (m2m_public_key.pem).
   - We verify the digital signature using the public key.
   - Benefit: Even if this AI service is compromised, no one can steal a private
     key or forge tokens to impersonate Spring Boot!

2. EXPIRATION CHECK:
   - Each token expires after 5 minutes.
   - PyJWT automatically checks the 'exp' timestamp and rejects expired tokens.
==============================================================================
"""

import os
from pathlib import Path
from typing import Any, Dict, Optional
import jwt
from jwt.exceptions import InvalidTokenError, ExpiredSignatureError


# Path to the RSA Public Key (X.509 format)
KEY_PATH = Path(__file__).resolve().parent.parent / "keys" / "m2m_public_key.pem"

_public_key_pem: Optional[str] = None


def get_public_key() -> str:
    """Loads and caches the RSA public key from disk."""
    global _public_key_pem
    if _public_key_pem is None:
        if not KEY_PATH.exists():
            raise FileNotFoundError(f"M2M public key not found at: {KEY_PATH}")
        _public_key_pem = KEY_PATH.read_text(encoding="utf-8")
    return _public_key_pem


def verify_m2m_token(token: str) -> Dict[str, Any]:
    """
    Verifies an incoming M2M RS256 JWT token using the RSA public key.

    Args:
        token: Raw JWT string (without 'Bearer ' prefix)

    Returns:
        Decoded token claims dictionary if valid.

    Raises:
        ExpiredSignatureError: If the token has expired (after 5 minutes).
        InvalidTokenError: If the signature is forged or invalid.
    """
    pub_key = get_public_key()

    # PyJWT verifies the RS256 signature, expiration ('exp'), issuer, and audience
    payload = jwt.decode(
        token,
        pub_key,
        algorithms=["RS256"],
        audience="fundsphere-ai-service",
        issuer="fundsphere-core-backend",
    )
    return payload
