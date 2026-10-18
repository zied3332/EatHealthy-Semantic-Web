
"""
SPARQL queries for personalized food recommendations.

Recommendations are derived from asserted RDF relationships
in the EatHealthy ontology.
"""

import re

from backend.queries.nutrition import PREFIXES


PERSON_NAME_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")


def build_recommendations_query(person_name: str) -> str:
    """
    Build a recommendation query for one ontology person.

    Only valid local RDF names are accepted to prevent
    SPARQL query injection.

    A food becomes a candidate when at least one positive
    compatibility assertion matches the person's profile.
    """

    if not PERSON_NAME_PATTERN.fullmatch(person_name):
        raise ValueError("Invalid ontology person name.")

    return PREFIXES + f"""
SELECT DISTINCT
    ?food
    ?goalMatch
    ?dietMatch
    ?profileMatch
    ?blocked
WHERE {{
    BIND(eh:{person_name} AS ?person)

    {{
        ?person eh:aObjectif ?goal .
        ?food eh:adapteAObjectif ?goal .
    }}
    UNION
    {{
        ?person eh:suitRegime ?diet .
        ?food eh:compatibleAvecRegime ?diet .
    }}
    UNION
    {{
        ?person eh:aProfil ?profile .
        ?food eh:compatibleAvecProfil ?profile .
    }}

    BIND(
        EXISTS {{
            ?person eh:aObjectif ?matchedGoal .
            ?food eh:adapteAObjectif ?matchedGoal .
        }}
        AS ?goalMatch
    )

    BIND(
        EXISTS {{
            ?person eh:suitRegime ?matchedDiet .
            ?food eh:compatibleAvecRegime ?matchedDiet .
        }}
        AS ?dietMatch
    )

    BIND(
        EXISTS {{
            ?person eh:aProfil ?matchedProfile .
            ?food eh:compatibleAvecProfil ?matchedProfile .
        }}
        AS ?profileMatch
    )

    BIND(
        EXISTS {{
            ?person eh:aRestriction ?restriction .
            ?food eh:estInterditPour ?restriction .
        }}
        AS ?blocked
    )
}}
ORDER BY ?food
"""
