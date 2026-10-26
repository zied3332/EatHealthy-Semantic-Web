"""Create the first administrator account in Fuseki."""

import asyncio
import os
import re
import sys
import uuid

from fastapi import HTTPException

from backend.auth import hash_password
from backend.queries.nutrition import PREFIXES
from backend.services.fuseki_service import (
    execute_sparql,
    execute_sparql_update,
)

USERNAME_PATTERN = re.compile(r"[A-Za-z0-9_.-]+\Z")


def required_setting(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


def literal(value: str | int | float) -> str:
    escaped = str(value).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


async def bootstrap_admin() -> str:
    username = required_setting("EATHEALTHY_ADMIN_USERNAME")
    password = required_setting("EATHEALTHY_ADMIN_PASSWORD")
    name = required_setting("EATHEALTHY_ADMIN_NAME")
    age = int(required_setting("EATHEALTHY_ADMIN_AGE"))
    weight = float(required_setting("EATHEALTHY_ADMIN_WEIGHT"))
    height = float(required_setting("EATHEALTHY_ADMIN_HEIGHT"))
    sex = required_setting("EATHEALTHY_ADMIN_SEX")

    if not USERNAME_PATTERN.fullmatch(username):
        raise ValueError(
            "EATHEALTHY_ADMIN_USERNAME may contain only letters, "
            "numbers, '.', '_' or '-'."
        )
    if len(password) < 8:
        raise ValueError("EATHEALTHY_ADMIN_PASSWORD must contain at least 8 characters.")
    if not 1 <= age <= 130:
        raise ValueError("EATHEALTHY_ADMIN_AGE must be between 1 and 130.")
    if not 0 < weight <= 500:
        raise ValueError("EATHEALTHY_ADMIN_WEIGHT must be between 0 and 500.")
    if not 0 < height <= 300:
        raise ValueError("EATHEALTHY_ADMIN_HEIGHT must be between 0 and 300.")

    existing_accounts = await execute_sparql(PREFIXES + """
SELECT ?account
WHERE {
    ?account a eh:UserAccount .
}
LIMIT 1
""")
    if existing_accounts:
        raise RuntimeError(
            "Bootstrap refused: an account already exists. "
            "Use the authenticated admin CRUD endpoint instead."
        )

    account = f"Account_{uuid.uuid4().hex}"
    person = (
        "User_"
        + re.sub(r"[^A-Za-z0-9_]", "_", username)
        + "_"
        + uuid.uuid4().hex[:8]
    )
    query = PREFIXES + f"""
INSERT DATA {{
    eh:{account} a eh:UserAccount ;
        eh:accountUsername {literal(username)} ;
        eh:accountPasswordHash {literal(hash_password(password))} ;
        eh:accountRole "admin" ;
        eh:accountPerson eh:{person} .
    eh:{person} a eh:Personne ;
        eh:aNom {literal(name)} ;
        eh:aAge {literal(age)} ;
        eh:aPoids {literal(weight)} ;
        eh:aTaille {literal(height)} ;
        eh:aSexe {literal(sex)} .
}}
"""
    await execute_sparql_update(query)
    return username


def main() -> int:
    try:
        username = asyncio.run(bootstrap_admin())
    except (HTTPException, RuntimeError, ValueError) as exc:
        print(f"Admin bootstrap failed: {exc}", file=sys.stderr)
        return 1

    print(f"Administrator account created for '{username}'.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
