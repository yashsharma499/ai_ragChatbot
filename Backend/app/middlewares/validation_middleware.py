from functools import wraps

from flask import request

from app.utils.responses import fail


def validate_json(required_fields=None):
    """
    Rejects non-JSON bodies and bodies missing required fields, and treats a
    field present but blank as missing (so `{"email": "  "}` fails here rather
    than deeper in a service).
    """
    required_fields = required_fields or []

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            data = request.get_json(silent=True)

            if not isinstance(data, dict):
                return fail("Request body must be a JSON object", 400, code="invalid_body")

            missing = [
                field
                for field in required_fields
                if field not in data
                or data[field] is None
                or (isinstance(data[field], str) and not data[field].strip())
            ]

            if missing:
                label = ", ".join(missing)
                return fail(
                    f"Missing required field{'s' if len(missing) > 1 else ''}: {label}",
                    400,
                    code="missing_fields",
                    fields=missing,
                )

            return fn(*args, **kwargs)

        return wrapper

    return decorator
