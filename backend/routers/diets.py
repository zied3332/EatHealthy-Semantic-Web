
"""
Dietary regime API routes for EatHealthy.

Retrieves dietary regime individuals and their types
from the ontology using SPARQL.
"""

from fastapi import APIRouter

from backend.queries.nutrition import DIETS_QUERY
from backend.services.fuseki_service import execute_sparql


router = APIRouter(
    prefix="/api/diets",
    tags=["Diets"],
)


@router.get("")
async def get_diets():
    """
    Retrieve dietary regimes and their types from Fuseki.
    """

    bindings = await execute_sparql(DIETS_QUERY)

    diets = []

    for row in bindings:
        regime_uri = row["regime"]["value"]
        type_uri = row["type"]["value"]

        diets.append({
            "uri": regime_uri,
            "name": regime_uri.rsplit("#", 1)[-1],
            "type": type_uri.rsplit("#", 1)[-1],
        })

    return {
        "count": len(diets),
        "diets": diets,
    }
