
"""
Food API routes for EatHealthy.

Retrieves food individuals, categories, and semantic
properties from the ontology using SPARQL.
"""

import re

from fastapi import APIRouter, HTTPException

from backend.queries.nutrition import (
    FOODS_QUERY,
    FOOD_DETAILS_QUERY,
)
from backend.services.fuseki_service import execute_sparql


router = APIRouter(
    prefix="/api/foods",
    tags=["Foods"],
)


def local_name(uri: str) -> str:
    """
    Extract the local name from an RDF URI.

    Example:
    http://example.org#Pomme -> Pomme
    """
    return uri.rsplit("#", 1)[-1].rsplit("/", 1)[-1]


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
            "name": local_name(food_uri),
            "category": local_name(type_uri),
        })

    return {
        "count": len(foods),
        "foods": foods,
    }


@router.get("/{food_name}")
async def get_food_details(food_name: str):
    """
    Retrieve directly asserted RDF properties
    for a specific food individual.

    Example:
    GET /api/foods/Pomme
    """

    # Validate the food identifier before inserting
    # it into the SPARQL query.
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", food_name):
        raise HTTPException(
            status_code=400,
            detail="Invalid food identifier.",
        )

    # Replace only the food identifier placeholder.
    # Do not use .format() because SPARQL uses braces.
    query = FOOD_DETAILS_QUERY.replace(
        "{food_name}",
        food_name,
    )

    # Execute the SPARQL query against Fuseki.
    bindings = await execute_sparql(query)

    if not bindings:
        raise HTTPException(
            status_code=404,
            detail=f"Food '{food_name}' not found.",
        )

    # Convert SPARQL bindings into readable properties.
    properties = []

    for row in bindings:
        property_uri = row["property"]["value"]
        value_binding = row["value"]

        value = value_binding["value"]
        value_type = value_binding.get("type", "literal")

        properties.append({
            "property": local_name(property_uri),
            "property_uri": property_uri,
            "value": (
                local_name(value)
                if value_type == "uri"
                else value
            ),
            "value_uri": (
                value
                if value_type == "uri"
                else None
            ),
            "value_type": value_type,
        })

    return {
        "name": food_name,
        "uri": (
            "http://www.semanticweb.org/thinkpad/"
            "ontologies/2026/9/EatHealthy#"
            f"{food_name}"
        ),
        "properties_count": len(properties),
        "properties": properties,
    }
