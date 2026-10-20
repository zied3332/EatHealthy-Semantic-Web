
"""
Safe SPARQL queries for explainable EatHealthy food recommendations.
"""

import re

from backend.queries.nutrition import PREFIXES


LOCAL_NAME_PATTERN = re.compile(r"[A-Za-z][A-Za-z0-9_]*\Z")


def validate_local_name(name: str) -> None:
    """Reject unsafe RDF local names before using them in SPARQL."""
    if not LOCAL_NAME_PATTERN.fullmatch(name):
        raise ValueError(f"Invalid ontology local name: {name!r}.")


def build_recommendations_query(
    person_name: str,
    diet: str | None = None,
    restrictions: list[str] | None = None,
) -> str:
    """
    Build an explainable food recommendation query.

    Diet:
        None -> use the person's ontology diet
        ""   -> clear the diet
        name -> use the selected diet

    Restrictions:
        None -> use the person's ontology restrictions
        []   -> clear all restrictions
        list -> use the selected restrictions
    """

    validate_local_name(person_name)

    if diet not in (None, ""):
        validate_local_name(diet)

    if restrictions is not None:
        for restriction in restrictions:
            validate_local_name(restriction)

    # ============================================================
    # DIET SELECTION
    # ============================================================

    if diet is None:
        diet_pattern = "?person eh:suitRegime ?matchedDiet ."

    elif diet == "":
        diet_pattern = "FILTER(false)"

    else:
        diet_pattern = f"BIND(eh:{diet} AS ?matchedDiet)"

    # ============================================================
    # RESTRICTION SELECTION
    # ============================================================

    if restrictions is None:
        restriction_pattern = (
            "?person eh:aRestriction ?activeRestriction ."
        )

    elif not restrictions:
        restriction_pattern = "FILTER(false)"

    else:
        values = " ".join(
            f"eh:{name}"
            for name in sorted(set(restrictions))
        )

        restriction_pattern = (
            f"VALUES ?activeRestriction {{ {values} }}"
        )

    # ============================================================
    # RECOMMENDATION QUERY
    # ============================================================

    return PREFIXES + f"""
SELECT DISTINCT
    ?food
    ?goalMatch
    ?dietMatch
    ?profileMatch
    ?blocked
WHERE {{
    BIND(eh:{person_name} AS ?person)

    # Foods matching the user's health goal
    {{
        ?person eh:aObjectif ?goal .
        ?food eh:adapteAObjectif ?goal .
    }}

    UNION

    # Foods compatible with the selected diet
    {{
        {diet_pattern}
        ?food eh:compatibleAvecRegime ?matchedDiet .
    }}

    UNION

    # Foods compatible with the activity profile
    {{
        ?person eh:aProfil ?profile .
        ?food eh:compatibleAvecProfil ?profile .
    }}

    UNION

    # Foods explicitly forbidden by an active restriction
    {{
        {restriction_pattern}

        {{
            ?activeRestriction eh:interditAliment ?food .
        }}

        UNION

        {{
            ?food eh:estInterditPour ?activeRestriction .
        }}
    }}

    # ========================================================
    # EXPLAINABLE MATCHES
    # ========================================================

    BIND(
        EXISTS {{
            ?person eh:aObjectif ?g .
            ?food eh:adapteAObjectif ?g .
        }}
        AS ?goalMatch
    )

    BIND(
        EXISTS {{
            {diet_pattern}
            ?food eh:compatibleAvecRegime ?matchedDiet .
        }}
        AS ?dietMatch
    )

    BIND(
        EXISTS {{
            ?person eh:aProfil ?p .
            ?food eh:compatibleAvecProfil ?p .
        }}
        AS ?profileMatch
    )

    # ========================================================
    # RESTRICTION EXCLUSIONS
    # ========================================================

    BIND(
        EXISTS {{
            {restriction_pattern}

            {{
                ?activeRestriction eh:interditAliment ?food .
            }}

            UNION

            {{
                ?food eh:estInterditPour ?activeRestriction .
            }}
        }}
        AS ?blocked
    )
}}
ORDER BY ?food
"""
