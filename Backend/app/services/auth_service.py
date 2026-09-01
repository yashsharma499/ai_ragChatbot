from datetime import datetime, timedelta

import jwt
from bson import ObjectId
from pymongo.errors import DuplicateKeyError
from werkzeug.security import check_password_hash, generate_password_hash

import app.extensions as extensions
from app.config import Config


class AuthService:
    # ------------------------------------------------------------------
    @staticmethod
    def _role_for(email: str) -> str:
        return "admin" if email.lower() in Config.ADMIN_EMAILS else "user"

    @staticmethod
    def _issue_token(user) -> str:
        payload = {
            "userId": str(user["_id"]),
            "email": user["email"],
            "role": user.get("role", "user"),
            "iat": datetime.utcnow(),
            "exp": datetime.utcnow() + timedelta(hours=Config.JWT_EXP_HOURS),
        }
        return jwt.encode(payload, Config.JWT_SECRET, algorithm="HS256")

    @staticmethod
    def _public_user(user) -> dict:
        return {
            "userId": str(user["_id"]),
            "name": user.get("name", ""),
            "email": user["email"],
            "role": user.get("role", "user"),
        }

    def _require_db(self):
        if extensions.db is None:
            raise RuntimeError(
                "The database is unavailable. Please check the server configuration."
            )

    # ------------------------------------------------------------------
    def register(self, email: str, password: str, name: str):
        self._require_db()

        email = email.strip().lower()
        name = name.strip()

        # Checked explicitly as well as caught below: the unique index is the
        # race-proof guarantee, but this gives the clean error in the normal case
        # and still works if the index could not be created.
        if extensions.db.users.find_one({"email": email}, {"_id": 1}):
            raise ValueError("An account with this email already exists")

        user = {
            "name": name,
            "email": email,
            "password": generate_password_hash(password),
            "role": self._role_for(email),
            "createdAt": datetime.utcnow(),
            "lastLogin": None,
        }

        try:
            result = extensions.db.users.insert_one(user)
        except DuplicateKeyError:
            raise ValueError("An account with this email already exists")

        user["_id"] = result.inserted_id

        # Signing the user in immediately removes a pointless second form.
        return {
            "token": self._issue_token(user),
            "user": self._public_user(user),
        }

    # ------------------------------------------------------------------
    def login(self, email: str, password: str):
        self._require_db()

        email = email.strip().lower()
        user = extensions.db.users.find_one({"email": email})

        # Same message either way, so the endpoint cannot be used to enumerate
        # which email addresses have accounts.
        if not user:
            raise ValueError("Invalid email or password")

        stored_password = user.get("password") or ""
        if isinstance(stored_password, bytes):
            stored_password = stored_password.decode("utf-8")

        if not check_password_hash(stored_password, password):
            raise ValueError("Invalid email or password")

        # Keeps an admin promoted via ADMIN_EMAILS in sync after the fact.
        expected_role = self._role_for(email)
        if expected_role == "admin" and user.get("role") != "admin":
            extensions.db.users.update_one(
                {"_id": user["_id"]}, {"$set": {"role": "admin"}}
            )
            user["role"] = "admin"

        extensions.db.users.update_one(
            {"_id": user["_id"]}, {"$set": {"lastLogin": datetime.utcnow()}}
        )

        return {
            "token": self._issue_token(user),
            "user": self._public_user(user),
        }

    # ------------------------------------------------------------------
    def get_profile(self, user_id: str):
        self._require_db()

        user = extensions.db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise ValueError("Account not found")

        profile = self._public_user(user)
        profile["createdAt"] = user.get("createdAt")
        profile["documentCount"] = extensions.db.documents.count_documents(
            {"userId": user["_id"]}
        )
        profile["queryCount"] = extensions.db.chat_messages.count_documents(
            {"userId": user["_id"]}
        )
        return profile
