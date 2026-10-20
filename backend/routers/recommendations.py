
"""
Explainable RDF recommendations with validated temporary dietary overrides.
"""

from fastapi import APIRouter, HTTPException, Query

from backend.queries.nutrition import PREFIXES
from backend.queries.recommendations import (
    build_recommendations_query,
    validate_local_name,
)
from backend.services.fuseki_service import execute_sparql


router = APIRouter(
    prefix="/api/recommendations",
    tags=["Recommendations"],
)


# ============================================================
# HELPERS
# ============================================================

def local_name(uri: str) -> str:
    """Extract the local name from an RDF URI."""
    return uri.rsplit("#", 1)[-1].rsplit("/", 1)[-1]


def binding_value(row: dict, key: str) -> str | None:
    """Read a value from a SPARQL JSON binding."""
    binding = row.get(key)

    return (
        binding.get("value")
        if isinstance(binding, dict)
        else None
    )


def binding_bool(row: dict, key: str) -> bool:
    """Interpret an xsd:boolean SPARQL result."""
    return binding_value(row, key) == "true"


# ============================================================
# VALIDATE ONTOLOGY INDIVIDUALS
# ============================================================

async def validate_individual(
    name: str,
    kind: str,
) -> None:
    """
    Validate an RDF individual against the ontology.

    RestrictionSansGluten1 is typed eh:SansGluten.

    SansGluten is a subclass of RegimeAlimentaire,
    not RestrictionAlimentaire.
    """

    validate_local_name(name)

    if kind == "diet":
        class_filter = (
            "FILTER(?type != eh:SansGluten)"
        )

        class_name = "RegimeAlimentaire"

    else:
        class_filter = """
FILTER(
    ?type = eh:SansGluten ||
    EXISTS {
        ?individual eh:interditAliment ?f .
    }
)
"""

        class_name = "RegimeAlimentaire"

    query = PREFIXES + f"""
SELECT DISTINCT ?individual
WHERE {{
    BIND(eh:{name} AS ?individual)

    ?individual rdf:type ?type .

    ?type rdfs:subClassOf* eh:{class_name} .

    {class_filter}
}}
LIMIT 1
"""

    if not await execute_sparql(query):
        raise HTTPException(
            status_code=422,
            detail=(
                f"Unknown or unsupported {kind} "
                f"individual: '{name}'."
            ),
        )


# ============================================================
# RECOMMENDATION ENDPOINT
# ============================================================

@router.get("/{person_name}")
async def get_recommendations(
    person_name: str,
    diet: str | None = Query(
        default=None,
        description=(
            "RDF diet local name; diet= clears it"
        ),
    ),
    restrictions: list[str] | None = Query(
        default=None,
        description=(
            "Repeated RDF restriction names; "
            "restrictions= clears all"
        ),
    ),
):
    """
    Return ranked food recommendations.

    Without overrides, use the person's RDF preferences.

    With overrides, use temporary preferences without
    modifying the ontology.
    """

    # ========================================================
    # VALIDATE REQUEST PARAMETERS
    # ========================================================

    try:
        validate_local_name(person_name)

        if diet not in (None, ""):
            validate_local_name(diet)

        if restrictions is not None:
            for restriction in restrictions:
                if restriction:
                    validate_local_name(restriction)

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    # ========================================================
    # FETCH ONTOLOGY PROFILE
    # ========================================================

    person_query = PREFIXES + f"""
SELECT DISTINCT ?person ?diet ?restriction
WHERE {{
    BIND(eh:{person_name} AS ?person)

    ?person rdf:type eh:Personne .

    OPTIONAL {{
        ?person eh:suitRegime ?diet .
    }}

    OPTIONAL {{
        ?person eh:aRestriction ?restriction .
    }}
}}
"""

    person_rows = await execute_sparql(person_query)

    if not person_rows:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Ontology person '{person_name}' not found."
            ),
        )

    ontology_diets = sorted({
        local_name(value)
        for row in person_rows
        if (
            value := binding_value(row, "diet")
        )
    })

    ontology_restrictions = sorted({
        local_name(value)
        for row in person_rows
        if (
            value := binding_value(row, "restriction")
        )
    })

    # ========================================================
    # VALIDATE DIET OVERRIDE
    # ========================================================

    if diet not in (None, ""):
        await validate_individual(
            diet,
            "diet",
        )

    # ========================================================
    # VALIDATE RESTRICTION OVERRIDES
    # ========================================================

    if restrictions is not None:
        restrictions = sorted(set(restrictions))

        # restrictions= means explicitly clear restrictions
        if restrictions == [""]:
            restrictions = []

        elif "" in restrictions:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Empty restriction cannot be "
                    "combined with names."
                ),
            )

        for name in restrictions:
            await validate_individual(
                name,
                "restriction",
            )

    # ========================================================
    # DETERMINE EFFECTIVE PREFERENCES
    # ========================================================

    selected_diet = (
        ontology_diets[0]
        if diet is None and ontology_diets
        else diet
    )

    selected_restrictions = (
        ontology_restrictions
        if restrictions is None
        else restrictions
    )

    # ========================================================
    # EXECUTE RECOMMENDATION QUERY
    # ========================================================

    query = build_recommendations_query(
        person_name,
        diet=diet,
        restrictions=restrictions,
    )

    rows = await execute_sparql(query)

    recommendations = []
    excluded = []

    # ========================================================
    # SCORE FOODS
    # ========================================================

    for row in rows:
        food_uri = binding_value(
            row,
            "food",
        )

        if not food_uri:
            continue

        goal_match = binding_bool(
            row,
            "goalMatch",
        )

        diet_match = binding_bool(
            row,
            "dietMatch",
        )

        profile_match = binding_bool(
            row,
            "profileMatch",
        )

        blocked = binding_bool(
            row,
            "blocked",
        )

        # ----------------------------------------------------
        # EXPLAIN RECOMMENDATION
        # ----------------------------------------------------

        reasons = []

        if goal_match:
            reasons.append(
                "Explicitly matches the user's health goal."
            )

        if diet_match:
            reasons.append(
                "Explicitly matches the selected dietary regime."
            )

        if profile_match:
            reasons.append(
                "Explicitly matches the user's activity profile."
            )

        # ----------------------------------------------------
        # CALCULATE SCORE
        # ----------------------------------------------------

        score = sum([
            goal_match,
            diet_match,
            profile_match,
        ])

        # ----------------------------------------------------
        # RESTRICTION SAFETY STATUS
        # ----------------------------------------------------

        if blocked:
            restriction_status = (
                "explicitly_incompatible"
            )

        elif selected_restrictions:
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

    # ========================================================
    # SORT RESULTS
    # ========================================================

    recommendations.sort(
        key=lambda food: (
            -food["score"],
            food["name"],
        )
    )

    excluded.sort(
        key=lambda food: food["name"]
    )

    # ========================================================
    # RESPONSE
    # ========================================================

    return {
        "person": person_name,
        "diet": selected_diet,
        "restrictions": selected_restrictions,
        "count": len(recommendations),
        "recommendations": recommendations,
        "excluded_count": len(excluded),
        "excluded": excluded,
        "disclaimer": (
            "Scores count matching RDF assertions, "
            "not nutritional quality. "
            "Missing diet or restriction assertions "
            "do not establish compatibility or safety."
        ),
    }
