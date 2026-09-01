"""
One response shape for the whole API so the frontend never has to guess.

    success -> {"success": true,  "data": {...}}
    failure -> {"success": false, "message": "...", "code": "..."}
"""

from flask import jsonify


def ok(data=None, status=200, **extra):
    payload = {"success": True, "data": data if data is not None else {}}
    payload.update(extra)
    return jsonify(payload), status


def fail(message, status=400, code=None, **extra):
    payload = {"success": False, "message": message}
    if code:
        payload["code"] = code
    payload.update(extra)
    return jsonify(payload), status
