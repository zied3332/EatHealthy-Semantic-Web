
"""
Personalized food recommendation API.

Uses SPARQL assertions stored in Apache Jena Fuseki.
Does not infer nutritional safety from missing data.
"""

from fastapi import APIRouter, HTTPException

from backend.queries.recommendations import (
    build_recommendations_query,
)
from backend.services.fuseki_service import execute_sparql


router = APIRouter(
    prefix="/api/recommendations",
    tags=["Recommendations"],
)


def local_name(uri: str) -> str:
    """Extract a readable RDF local name."""
    return uri.rsplit("#", 1)[-1].rsplit("/", 1)[-1]


def binding_value(row: dict, key: str) -> str | None:
    """Read a value from a SPARQL JSON binding."""
    binding = row.get(key)

    if not isinstance(binding, dict):
        return None

    return binding.get("value")


def binding_bool(row: dict, key: str) -> bool:
    """Interpret an xsd:boolean SPARQL result."""
    return binding_value(row, key) == "true"


@router.get("/{person_name}")
async def get_recommendations(person_name: str):
    """
    Retrieve explainable recommendations for an RDF person.

    Foods are included when they match at least one of:
    - Health goal
    - Dietary regime
    - Activity profile

    Foods explicitly forbidden by a recorded restriction
    are excluded from recommendations.

    Missing compatibility data is never treated as
    confirmation of safety.
    """

    try:
        query = build_recommendations_query(person_name)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    # Confirm the person exists in the ontology.
    person_query = f"""
PREFIX eh: <http://www.semanticweb.org/thinkpad/ontologies/2026/9/EatHealthy#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT DISTINCT ?person ?restriction
WHERE {{
    BIND(eh:{person_name} AS ?person)

    ?person rdf:type eh:Personne .

    OPTIONAL {{
        ?person eh:aRestriction ?restriction .
    }}
}}
"""

    person_rows = await execute_sparql(person_query)

    if not person_rows:
        raise HTTPException(
            status_code=404,
            detail=f"Ontology person '{person_name}' not found.",
        )

    restrictions = sorted({
        local_name(value)
        for row in person_rows
        if (value := binding_value(row, "restriction"))
    })

    rows = await execute_sparql(query)

    recommendations = []
    excluded = []

    for row in rows:
        food_uri = binding_value(row, "food")

        if not food_uri:
            continue

        goal_match = binding_bool(row, "goalMatch")
        diet_match = binding_bool(row, "dietMatch")
        profile_match = binding_bool(row, "profileMatch")
        blocked = binding_bool(row, "blocked")

        reasons = []

        if goal_match:
            reasons.append(
                "Explicitly matches the user's health goal."
            )

        if diet_match:
            reasons.append(
                "Explicitly matches the user's dietary regime."
            )

        if profile_match:
            reasons.append(
                "Explicitly matches the user's activity profile."
            )

        score = sum([
            goal_match,
            diet_match,
            profile_match,
        ])

        if blocked:
            restriction_status = "explicitly_incompatible"
        elif restrictions:
            restriction_status = "unknown"
        else:
            restriction_status = "not_applicable"

        food = {
            "uri": food_uri,
            "name": local_name(food_uri),
            "score": score,
            "max_score": 3,
            "matches": {
                "goal": goal_match,
                "diet": diet_match,
                "activity_profile": profile_match,
            },
            "restriction_status": restriction_status,
            "reasons": reasons,
        }

        if blocked:
            excluded.append(food)
        else:
            recommendations.append(food)

    recommendations.sort(
        key=lambda food: (
            -food["score"],
            food["name"],
        )
    )

    return {
        "person": person_name,
        "restrictions": restrictions,
        "count": len(recommendations),
        "recommendations": recommendations,
        "excluded_count": len(excluded),
        "excluded": excluded,
        "disclaimer": (
            "Scores count matching RDF assertions, not "
            "nutritional quality. Missing diet or restriction "
            "assertions do not establish compatibility or safety."
        ),
    }
