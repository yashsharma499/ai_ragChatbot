from datetime import date, datetime

from bson import ObjectId


def serialize_value(value):
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        # Stored naive in UTC; emit an explicit UTC ISO-8601 string so the
        # browser does not read it as local time.
        return value.isoformat() + "Z" if value.tzinfo is None else value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return serialize_dict(value)
    if isinstance(value, list):
        return [serialize_value(item) for item in value]
    return value


# Kept for backwards compatibility with older call sites.
serialize_object_id = serialize_value


def serialize_dict(data: dict) -> dict:
    """Recursively converts ObjectId / datetime values into JSON-safe strings."""
    return {key: serialize_value(value) for key, value in data.items()}


def serialize_document(doc: dict) -> dict:
    """
    Serializes a Mongo document and exposes `_id` as `id` as well, so the
    frontend can use a stable field name regardless of collection.
    """
    result = serialize_dict(doc)
    if "_id" in result:
        result["id"] = result["_id"]
    return result
