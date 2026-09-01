import re

from flask import Blueprint, request

from app.config import Config
from app.extensions import limiter
from app.middlewares.auth_middleware import jwt_required
from app.middlewares.validation_middleware import validate_json
from app.services.auth_service import AuthService
from app.utils.responses import fail, ok
from app.utils.serializer import serialize_dict

auth_bp = Blueprint("auth", __name__)
auth_service = AuthService()

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")

MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128
MAX_NAME_LENGTH = 80


def validate_password(password: str):
    """
    Returns every unmet rule at once so the user can fix their password in one
    attempt instead of discovering the rules one error at a time.
    """
    problems = []

    if len(password) < MIN_PASSWORD_LENGTH:
        problems.append(f"be at least {MIN_PASSWORD_LENGTH} characters")
    if len(password) > MAX_PASSWORD_LENGTH:
        problems.append(f"be at most {MAX_PASSWORD_LENGTH} characters")
    if not any(c.isupper() for c in password):
        problems.append("contain an uppercase letter")
    if not any(c.islower() for c in password):
        problems.append("contain a lowercase letter")
    if not any(c.isdigit() for c in password):
        problems.append("contain a number")

    return problems


@auth_bp.route("/register", methods=["POST"])
@limiter.limit(lambda: Config.RATELIMIT_AUTH)
@validate_json(required_fields=["email", "password", "name"])
def register():
    data = request.get_json()

    email = str(data["email"]).strip()
    password = str(data["password"])
    name = str(data["name"]).strip()

    if not EMAIL_RE.match(email):
        return fail("Please enter a valid email address", 400, code="invalid_email")

    if len(name) > MAX_NAME_LENGTH:
        return fail(
            f"Name must be at most {MAX_NAME_LENGTH} characters", 400, code="invalid_name"
        )

    problems = validate_password(password)
    if problems:
        return fail(
            "Password must " + ", ".join(problems),
            400,
            code="weak_password",
            requirements=problems,
        )

    try:
        result = auth_service.register(email, password, name)
    except ValueError as e:
        return fail(str(e), 409, code="email_taken")
    except RuntimeError as e:
        return fail(str(e), 503, code="db_unavailable")

    return ok(result, 201)


@auth_bp.route("/login", methods=["POST"])
@limiter.limit(lambda: Config.RATELIMIT_AUTH)
@validate_json(required_fields=["email", "password"])
def login():
    data = request.get_json()

    email = str(data["email"]).strip()
    password = str(data["password"])

    if not EMAIL_RE.match(email):
        return fail("Please enter a valid email address", 400, code="invalid_email")

    try:
        result = auth_service.login(email, password)
    except ValueError as e:
        return fail(str(e), 401, code="invalid_credentials")
    except RuntimeError as e:
        return fail(str(e), 503, code="db_unavailable")

    return ok(result)


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
@limiter.limit(lambda: Config.RATELIMIT_READ)
def me():
    """
    Lets the frontend verify a stored token is still valid on boot, instead of
    trusting whatever is sitting in localStorage.
    """
    try:
        profile = auth_service.get_profile(request.user["userId"])
    except ValueError as e:
        return fail(str(e), 404, code="not_found")
    except RuntimeError as e:
        return fail(str(e), 503, code="db_unavailable")

    return ok({"user": serialize_dict(profile)})
