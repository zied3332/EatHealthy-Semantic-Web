
"""Health objectives and dietary regimes CRUD API."""

import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict

from backend.auth import current_account, require_admin
from backend.queries.nutrition import PREFIXES
from backend.services.fuseki_service import (
    execute_sparql,
    execute_sparql_update,
)

router = APIRouter(
    prefix="/api/health-preferences",
    tags=["Health Preferences"],
)

NAMESPACE = (
    "http://www.semanticweb.org/thinkpad/"
    "ontologies/2026/9/EatHealthy#"
)

GOALS = {
    "ObjectifPriseMasse1",
    "ObjectifPertePoids1",
    "ObjectifMaintienPoids1",
}

DIETS = {
    "RegimeOmnivore1",
    "RegimeVegetarien1",
    "RegimeVegan1",
    "RestrictionSansGluten1",
}

IDENTIFIER = re.compile(r"^[A-Za-z][A-Za-z0-9_-]*$")


class PreferencesRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    goal: str | None = None
    diet: str | None = None


def local_name(uri: str) -> str:
    return uri.rsplit("#", 1)[-1]


def validate_identifier(value: str) -> str:
    if not IDENTIFIER.fullmatch(value):
        raise HTTPException(
            status_code=400,
            detail="Invalid RDF identifier.",
        )
    return value


async def resolve_person(account_id: str) -> str:
    """Find the Personne linked to an authenticated account."""

    validate_identifier(account_id)

    rows = await execute_sparql(
        PREFIXES + f"""
SELECT DISTINCT ?person
WHERE {{
    eh:{account_id} a eh:UserAccount ;
                    eh:accountPerson ?person .
    ?person a eh:Personne .
}}
LIMIT 1
"""
    )

    if not rows:
        raise HTTPException(
            status_code=404,
            detail="Account or linked person not found.",
        )

    uri = rows[0]["person"]["value"]

    if not uri.startswith(NAMESPACE):
        raise HTTPException(
            status_code=400,
            detail="Person URI is outside the ontology.",
        )

    return validate_identifier(local_name(uri))


async def read_preferences(person: str) -> dict:
    """Read the current objective and dietary regime."""

    rows = await execute_sparql(
        PREFIXES + f"""
SELECT ?goal ?diet
WHERE {{
    BIND(eh:{person} AS ?person)
    OPTIONAL {{ ?person eh:aObjectif ?goal . }}
    OPTIONAL {{ ?person eh:suitRegime ?diet . }}
}}
LIMIT 1
"""
    )

    row = rows[0] if rows else {}

    return {
        "person": person,
        "goal": (
            local_name(row["goal"]["value"])
            if "goal" in row
            else None
        ),
        "diet": (
            local_name(row["diet"]["value"])
            if "diet" in row
            else None
        ),
    }


def validate_preferences(data: PreferencesRequest) -> None:
    if data.goal is not None and data.goal not in GOALS:
        raise HTTPException(
            status_code=422,
            detail="Unsupported health objective.",
        )

    if data.diet is not None and data.diet not in DIETS:
        raise HTTPException(
            status_code=422,
            detail="Unsupported dietary regime.",
        )


async def create_preferences(
    person: str,
    data: PreferencesRequest,
) -> dict:
    """Create missing health preferences."""

    validate_preferences(data)

    if data.goal is None and data.diet is None:
        raise HTTPException(
            status_code=422,
            detail="Provide at least one preference.",
        )

    current = await read_preferences(person)

    if (
        (data.goal is not None and current["goal"] is not None)
        or (data.diet is not None and current["diet"] is not None)
    ):
        raise HTTPException(
            status_code=409,
            detail="Preference already exists. Use PUT.",
        )

    triples = []

    if data.goal:
        triples.append(
            f"eh:{person} eh:aObjectif eh:{data.goal} ."
        )

    if data.diet:
        triples.append(
            f"eh:{person} eh:suitRegime eh:{data.diet} ."
        )

    await execute_sparql_update(
        PREFIXES + "INSERT DATA {\n"
        + "\n".join(triples)
        + "\n}"
    )

    return await read_preferences(person)


async def replace_preferences(
    person: str,
    data: PreferencesRequest,
) -> dict:
    """Replace both preferences in a single SPARQL update."""

    validate_preferences(data)

    inserts = []

    if data.goal:
        inserts.append(
            f"eh:{person} eh:aObjectif eh:{data.goal} ."
        )

    if data.diet:
        inserts.append(
            f"eh:{person} eh:suitRegime eh:{data.diet} ."
        )

    await execute_sparql_update(
        PREFIXES + f"""
DELETE {{
    eh:{person} eh:aObjectif ?oldGoal .
    eh:{person} eh:suitRegime ?oldDiet .
}}
INSERT {{
    {' '.join(inserts)}
}}
WHERE {{
    OPTIONAL {{
        eh:{person} eh:aObjectif ?oldGoal .
    }}
    OPTIONAL {{
        eh:{person} eh:suitRegime ?oldDiet .
    }}
}}
"""
    )

    return await read_preferences(person)


async def delete_preferences(person: str) -> dict:
    """Remove both preferences in one SPARQL update."""

    await execute_sparql_update(
        PREFIXES + f"""
DELETE {{
    eh:{person} eh:aObjectif ?goal .
    eh:{person} eh:suitRegime ?diet .
}}
WHERE {{
    OPTIONAL {{
        eh:{person} eh:aObjectif ?goal .
    }}
    OPTIONAL {{
        eh:{person} eh:suitRegime ?diet .
    }}
}}
"""
    )

    return {
        "message": "Health preferences deleted.",
        "person": person,
    }


# ============================================================
# AUTHENTICATED CLIENT ENDPOINTS
# ============================================================

@router.get("/me")
async def get_my_preferences(
    account: dict = Depends(current_account),
):
    person = await resolve_person(account["id"])
    return await read_preferences(person)


@router.post("/me", status_code=201)
async def create_my_preferences(
    data: PreferencesRequest,
    account: dict = Depends(current_account),
):
    person = await resolve_person(account["id"])
    return await create_preferences(person, data)


@router.put("/me")
async def update_my_preferences(
    data: PreferencesRequest,
    account: dict = Depends(current_account),
):
    person = await resolve_person(account["id"])
    return await replace_preferences(person, data)


@router.delete("/me")
async def delete_my_preferences(
    account: dict = Depends(current_account),
):
    person = await resolve_person(account["id"])
    return await delete_preferences(person)


# ============================================================
# ADMIN ENDPOINTS
# ============================================================

@router.get("/users/{account_id}")
async def admin_get_preferences(
    account_id: str,
    _: dict = Depends(require_admin),
):
    person = await resolve_person(account_id)
    return await read_preferences(person)


@router.post("/users/{account_id}", status_code=201)
async def admin_create_preferences(
    account_id: str,
    data: PreferencesRequest,
    _: dict = Depends(require_admin),
):
    person = await resolve_person(account_id)
    return await create_preferences(person, data)


@router.put("/users/{account_id}")
async def admin_update_preferences(
    account_id: str,
    data: PreferencesRequest,
    _: dict = Depends(require_admin),
):
    person = await resolve_person(account_id)
    return await replace_preferences(person, data)


@router.delete("/users/{account_id}")
async def admin_delete_preferences(
    account_id: str,
    _: dict = Depends(require_admin),
):
    person = await resolve_person(account_id)
    return await delete_preferences(person)
