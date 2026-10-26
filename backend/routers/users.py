"""Authentication and CRUD endpoints for RDF-backed users."""

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.auth import (
    create_access_token,
    current_account,
    hash_password,
    require_admin,
    verify_password,
)
from backend.queries.nutrition import PREFIXES
from backend.services.fuseki_service import (
    execute_sparql,
    execute_sparql_update,
)

router = APIRouter(prefix="/api/users", tags=["Users"])
LOCAL_NAME = re.compile(r"[A-Za-z][A-Za-z0-9_]*\Z")


class UserProfile(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    age: int = Field(ge=1, le=130)
    weight: float = Field(gt=0, le=500)
    height: float = Field(gt=0, le=300)
    sex: str = Field(min_length=1, max_length=30)


class RegisterRequest(UserProfile):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=128)


class AdminCreateRequest(RegisterRequest):
    role: str = "client"


class LoginRequest(BaseModel):
    username: str
    password: str


class ProfileUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    age: int | None = Field(default=None, ge=1, le=130)
    weight: float | None = Field(default=None, gt=0, le=500)
    height: float | None = Field(default=None, gt=0, le=300)
    sex: str | None = Field(default=None, min_length=1, max_length=30)
    diet: str | None = None
    sport_profile: str | None = None


def literal(value: str | int | float) -> str:
    """Escape a value for a SPARQL string literal."""
    escaped = str(value).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def validate_name(value: str) -> None:
    if not LOCAL_NAME.fullmatch(value):
        raise HTTPException(status_code=400, detail="Invalid RDF identifier.")


def account_query(username: str) -> str:
    return PREFIXES + f"""
SELECT ?account ?passwordHash ?role ?person
WHERE {{
    ?account eh:accountUsername {literal(username)} ;
             eh:accountPasswordHash ?passwordHash ;
             eh:accountRole ?role ;
             eh:accountPerson ?person .
}}
LIMIT 1
"""


async def find_account(username: str) -> dict | None:
    rows = await execute_sparql(account_query(username))
    if not rows:
        return None
    row = rows[0]
    return {
        key: row[key]["value"]
        for key in ("account", "passwordHash", "role", "person")
    }


def person_name(username: str) -> str:
    safe_username = re.sub(r"[^A-Za-z0-9_]", "_", username)
    return f"User_{safe_username}_{uuid.uuid4().hex[:8]}"


async def create_account(data: RegisterRequest, role: str) -> dict:
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", data.username):
        raise HTTPException(
            status_code=422,
            detail="Username may contain letters, numbers, '.', '_' or '-'.",
        )
    if role not in {"client", "admin"}:
        raise HTTPException(status_code=422, detail="Invalid user role.")
    if await find_account(data.username):
        raise HTTPException(status_code=409, detail="Username already exists.")

    account = f"Account_{uuid.uuid4().hex}"
    person = person_name(data.username)
    query = PREFIXES + f"""
INSERT DATA {{
    eh:{account} a eh:UserAccount ;
        eh:accountUsername {literal(data.username)} ;
        eh:accountPasswordHash {literal(hash_password(data.password))} ;
        eh:accountRole {literal(role)} ;
        eh:accountPerson eh:{person} .
    eh:{person} a eh:Personne ;
        eh:aNom {literal(data.name)} ;
        eh:aAge {literal(data.age)} ;
        eh:aPoids {literal(data.weight)} ;
        eh:aTaille {literal(data.height)} ;
        eh:aSexe {literal(data.sex)} .
}}
"""
    await execute_sparql_update(query)
    return {
        "access_token": create_access_token(account, role),
        "token_type": "bearer",
        "username": data.username,
        "role": role,
        "person": person,
    }


@router.post("/register", status_code=201)
async def register(data: RegisterRequest):
    """Register a client account and its semantic Personne profile."""
    return await create_account(data, "client")


@router.post("")
async def create_user(
    data: AdminCreateRequest,
    _: dict = Depends(require_admin),
):
    """Create an account; administrators can choose the role."""
    return await create_account(data, data.role)


@router.post("/login")
async def login(data: LoginRequest):
    """Authenticate an account and return a JWT."""
    account = await find_account(data.username)
    if not account or not verify_password(
        data.password,
        account["passwordHash"],
    ):
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    return {
        "access_token": create_access_token(account["account"], account["role"]),
        "token_type": "bearer",
        "username": data.username,
        "role": account["role"],
        "person": account["person"].rsplit("#", 1)[-1],
    }


@router.get("/me")
async def get_current_user(account: dict = Depends(current_account)):
    """Return the authenticated account identity."""
    return account


@router.get("")
async def list_users(_: dict = Depends(require_admin)):
    """List all accounts; administrators only."""
    rows = await execute_sparql(PREFIXES + """
SELECT ?account ?username ?role ?person ?name ?age ?weight ?height ?sex
WHERE {
    ?account a eh:UserAccount ;
             eh:accountUsername ?username ;
             eh:accountRole ?role ;
             eh:accountPerson ?person .
    OPTIONAL { ?person eh:aNom ?name . }
    OPTIONAL { ?person eh:aAge ?age . }
    OPTIONAL { ?person eh:aPoids ?weight . }
    OPTIONAL { ?person eh:aTaille ?height . }
    OPTIONAL { ?person eh:aSexe ?sex . }
}
ORDER BY ?username
""")
    def value(row: dict, key: str) -> str | None:
        binding = row.get(key)
        return binding["value"] if binding else None

    return {
        "count": len(rows),
        "users": [
            {
                "id": row["account"]["value"],
                "username": row["username"]["value"],
                "role": row["role"]["value"],
                "person": row["person"]["value"].rsplit("#", 1)[-1],
                "name": value(row, "name"),
                "age": value(row, "age"),
                "weight": value(row, "weight"),
                "height": value(row, "height"),
                "sex": value(row, "sex"),
            }
            for row in rows
        ],
    }


@router.patch("/{person_name}/role")
async def update_role(
    person_name: str,
    role: str,
    _: dict = Depends(require_admin),
):
    """Change an account role; administrators only."""
    validate_name(person_name)
    if role not in {"client", "admin"}:
        raise HTTPException(status_code=422, detail="Invalid user role.")
    query = PREFIXES + f"""
DELETE {{ ?account eh:accountRole ?oldRole . }}
INSERT {{ ?account eh:accountRole {literal(role)} . }}
WHERE {{
    ?account eh:accountPerson eh:{person_name} ;
             eh:accountRole ?oldRole .
}}
"""
    await execute_sparql_update(query)
    return {"message": "Role updated.", "person": person_name, "role": role}


@router.put("/{person_name}")
async def update_profile(
    person_name: str,
    data: ProfileUpdateRequest,
    account: dict = Depends(current_account),
):
    """Update a client's profile or an admin-selected profile."""
    validate_name(person_name)
    if account["role"] != "admin":
        rows = await execute_sparql(PREFIXES + f"""
SELECT ?account WHERE {{
    ?account eh:accountPerson eh:{person_name} .
}}
""")
        if not rows or rows[0]["account"]["value"].rsplit("#", 1)[-1] != account["id"].rsplit("#", 1)[-1]:
            raise HTTPException(status_code=403, detail="Access denied.")

    predicates = {
        "name": "aNom",
        "age": "aAge",
        "weight": "aPoids",
        "height": "aTaille",
        "sex": "aSexe",
    }
    delete_parts = []
    insert_parts = []
    for field, predicate in predicates.items():
        value = getattr(data, field)
        if value is not None:
            delete_parts.append(f"eh:{person_name} eh:{predicate} ?old_{field} .")
            insert_parts.append(f"eh:{person_name} eh:{predicate} {literal(value)} .")
    if not delete_parts:
        raise HTTPException(status_code=400, detail="No profile fields supplied.")

    query = PREFIXES + f"""
DELETE {{ {' '.join(delete_parts)} }}
INSERT {{ {' '.join(insert_parts)} }}
WHERE {{ OPTIONAL {{ {' '.join(delete_parts)} }} }}
"""
    await execute_sparql_update(query)
    return {"message": "Profile updated.", "person": person_name}


@router.delete("/{person_name}")
async def delete_user(
    person_name: str,
    _: dict = Depends(require_admin),
):
    """Delete an account and its linked semantic profile."""
    validate_name(person_name)
    query = PREFIXES + f"""
DELETE {{
    ?account ?accountProperty ?accountValue .
    eh:{person_name} ?personProperty ?personValue .
}}
WHERE {{
    OPTIONAL {{
        ?account eh:accountPerson eh:{person_name} ;
                 ?accountProperty ?accountValue .
    }}
    OPTIONAL {{
        eh:{person_name} ?personProperty ?personValue .
    }}
}}
"""
    await execute_sparql_update(query)
    return {"message": "User deleted.", "person": person_name}
