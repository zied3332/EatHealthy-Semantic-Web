
"""
Safe SPARQL generation for EatHealthy NLP.
"""

from backend.queries.nutrition import PREFIXES
from backend.services.nlp_service import NLPAnalysis


ALLOWED_DIETS = {
    "RegimeVegetarien1",
    "RegimeVegan1",
    "RegimeOmnivore1",
    "RestrictionSansGluten1",
}

ALLOWED_GOALS = {
    "ObjectifPriseMasse1",
    "ObjectifPertePoids1",
    "ObjectifMaintienPoids1",
}


def generate_sparql(analysis: NLPAnalysis) -> str:

    if analysis.intent == "persons_by_diet":

        if analysis.entity not in ALLOWED_DIETS:
            raise ValueError("Régime non autorisé.")

        conditions = (
            f"?person eh:suitRegime eh:{analysis.entity} ."
        )

    elif analysis.intent == "persons_by_goal":

        if analysis.entity not in ALLOWED_GOALS:
            raise ValueError("Objectif non autorisé.")

        conditions = (
            f"?person eh:aObjectif eh:{analysis.entity} ."
        )

    elif analysis.intent == "persons_by_diet_and_goal":

        if (
            analysis.entity not in ALLOWED_DIETS
            or analysis.secondary_entity not in ALLOWED_GOALS
        ):
            raise ValueError(
                "Combinaison de concepts non autorisée."
            )

        conditions = f"""
        ?person eh:suitRegime eh:{analysis.entity} .
        ?person eh:aObjectif eh:{analysis.secondary_entity} .
        """

    else:
        raise ValueError(
            "Intention NLP non prise en charge."
        )

    return PREFIXES + f"""
SELECT DISTINCT ?person
WHERE {{
    ?person a eh:Personne .
    {conditions}
}}
ORDER BY ?person
"""
