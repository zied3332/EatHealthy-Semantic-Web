
"""
User Profile API routes for EatHealthy.

Reads semantic profile options and existing user
relationships from Apache Jena Fuseki.
"""

from fastapi import APIRouter

from backend.queries.profile import (
    PROFILE_OPTIONS_QUERY,
    PERSON_RELATIONSHIPS_QUERY,
)
from backend.services.fuseki_service import execute_sparql


router = APIRouter(
    prefix="/api/profile",
    tags=["Profile"],
)


def local_name(uri: str) -> str:
    """Extract an RDF resource's local name."""
    return uri.rsplit("#", 1)[-1].rsplit("/", 1)[-1]


@router.get("/options")
async def get_profile_options():
    """
    Retrieve available profile options from the ontology.
    """

    bindings = await execute_sparql(
        PROFILE_OPTIONS_QUERY
    )

    options = {
        "persons": [],
        "activity_profiles": [],
        "health_goals": [],
        "restrictions": [],
    }

    category_mapping = {
        "person": "persons",
        "activity_profile": "activity_profiles",
        "health_goal": "health_goals",
        "restriction": "restrictions",
    }

    for row in bindings:
        category = row["category"]["value"]
        target = category_mapping.get(category)

        if target is None:
            continue

        individual_uri = row["individual"]["value"]
        type_uri = row["type"]["value"]

        options[target].append({
            "uri": individual_uri,
            "name": local_name(individual_uri),
            "type": local_name(type_uri),
        })

    return {
        "counts": {
            key: len(value)
            for key, value in options.items()
        },
        **options,
    }


@router.get("/relationships")
async def get_person_relationships():
    """
    Retrieve RDF properties associated with existing users.

    This endpoint is read-only and does not create
    or modify profile data.
    """

    bindings = await execute_sparql(
        PERSON_RELATIONSHIPS_QUERY
    )

    relationships = []

    for row in bindings:
        person_uri = row["person"]["value"]
        property_uri = row["property"]["value"]
        value_binding = row["value"]

        value = value_binding["value"]
        value_type = value_binding.get("type", "literal")

        relationships.append({
            "person": local_name(person_uri),
            "person_uri": person_uri,
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
        "count": len(relationships),
        "relationships": relationships,
    }
