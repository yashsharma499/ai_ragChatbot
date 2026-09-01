from functools import wraps

import jwt
from flask import request

from app.config import Config
from app.utils.responses import fail


def _extract_token():
    auth_header = request.headers.get("Authorization", "")

    if not auth_header:
        return None, "Authorization header missing"

    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None, "Authorization header must be 'Bearer <token>'"

    return parts[1], None


def jwt_required(role=None):
    """
    Verifies the bearer token and attaches `request.user`.

    `role="admin"` additionally requires the admin role. Distinguishes an
    invalid/expired token (401, client should log in again) from a valid token
    without sufficient privileges (403).
    """

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            token, header_error = _extract_token()
            if header_error:
                return fail(header_error, 401, code="unauthorized")

            try:
                payload = jwt.decode(token, Config.JWT_SECRET, algorithms=["HS256"])
            except jwt.ExpiredSignatureError:
                return fail("Session expired. Please sign in again.", 401, code="token_expired")
            except jwt.InvalidTokenError:
                return fail("Invalid authentication token", 401, code="invalid_token")

            user_id = payload.get("userId")
            if not user_id:
                return fail("Invalid authentication token", 401, code="invalid_token")

            request.user = {
                "userId": user_id,
                "email": payload.get("email"),
                "role": payload.get("role", "user"),
            }

            if role and request.user["role"] != role:
                return fail(f"{role.capitalize()} access required", 403, code="forbidden")

            return fn(*args, **kwargs)

        return wrapper

    return decorator
