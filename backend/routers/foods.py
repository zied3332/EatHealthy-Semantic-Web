
"""
Food API routes for EatHealthy.

Retrieves food individuals and their categories
from the ontology using SPARQL.
"""

from fastapi import APIRouter

from backend.queries.nutrition import FOODS_QUERY
from backend.services.fuseki_service import execute_sparql


router = APIRouter(
    prefix="/api/foods",
    tags=["Foods"],
)


@router.get("")
async def get_foods():
    """
    Retrieve foods and their categories from Fuseki.
    """

    bindings = await execute_sparql(FOODS_QUERY)

    foods = []

    for row in bindings:
        food_uri = row["aliment"]["value"]
        type_uri = row["type"]["value"]

        foods.append({
            "uri": food_uri,
            "name": food_uri.rsplit("#", 1)[-1],
            "category": type_uri.rsplit("#", 1)[-1],
        })

    return {
        "count": len(foods),
        "foods": foods,
    }
