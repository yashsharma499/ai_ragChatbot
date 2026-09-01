"""
Creates or promotes an administrator account.

There is no way to become an admin through the API on purpose, so this is how
you get the first one.

    python seed_admin.py admin@example.com "SuperSecret1"
    python seed_admin.py admin@example.com "SuperSecret1" --name "Ops Team"

Running it against an existing email promotes that account to admin and, if a
password is given, resets the password.
"""

import argparse
import sys
from datetime import datetime

from dotenv import load_dotenv

load_dotenv()

from werkzeug.security import generate_password_hash  # noqa: E402

import app.extensions as extensions  # noqa: E402
from app.main import create_app  # noqa: E402
from app.routes.auth import validate_password  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description="Create or promote an admin user")
    parser.add_argument("email")
    parser.add_argument("password", nargs="?", help="Required when creating a new account")
    parser.add_argument("--name", default="Administrator")
    args = parser.parse_args()

    email = args.email.strip().lower()

    # This script exits in a second; loading the embedding model is pointless.
    app = create_app(warm_embeddings=False)
    with app.app_context():
        if extensions.db is None:
            print("ERROR: could not connect to MongoDB. Check MONGO_URI in .env.")
            return 1

        existing = extensions.db.users.find_one({"email": email})

        if existing:
            update = {"role": "admin"}
            if args.password:
                problems = validate_password(args.password)
                if problems:
                    print("ERROR: password must " + ", ".join(problems))
                    return 1
                update["password"] = generate_password_hash(args.password)

            extensions.db.users.update_one({"_id": existing["_id"]}, {"$set": update})
            action = "promoted and password reset" if args.password else "promoted"
            print(f"OK: {email} {action} to admin.")
            return 0

        if not args.password:
            print("ERROR: a password is required when creating a new account.")
            return 1

        problems = validate_password(args.password)
        if problems:
            print("ERROR: password must " + ", ".join(problems))
            return 1

        extensions.db.users.insert_one(
            {
                "name": args.name,
                "email": email,
                "password": generate_password_hash(args.password),
                "role": "admin",
                "createdAt": datetime.utcnow(),
                "lastLogin": None,
            }
        )
        print(f"OK: admin account created for {email}.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
