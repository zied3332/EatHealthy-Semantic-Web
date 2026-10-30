
"""
Unified NLP API for EatHealthy.

Routes natural-language questions to the appropriate
NLP engine and returns generated SPARQL and Fuseki results.

No external LLM API is used.
"""

import re
import unicodedata

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.services import nl2sparql
from backend.services.nlp_service import analyze_question
from backend.services.sparql_generator import generate_sparql
from backend.services.fuseki_service import execute_sparql


router = APIRouter(
    prefix="/api/nlp",
    tags=["Natural Language Processing"],
)


class NLPQuestion(BaseModel):
    question: str = Field(min_length=3, max_length=500)


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    return "".join(
        char for char in text
        if not unicodedata.combining(char)
    ).lower()


def is_person_question(question: str) -> bool:
    text = normalize(question)

    return bool(
        re.search(
            r"\b(qui|utilisateurs?|personnes?|patients?|membres?)\b",
            text,
        )
    )


def format_bindings(bindings: list[dict]) -> list[dict]:
    rows = []

    for binding in bindings:
        row = {}

        for key, item in binding.items():
            value = item.get("value", "")

            if item.get("type") == "uri":
                value = value.rsplit("#", 1)[-1]

            row[key] = value

        rows.append(row)

    return rows


@router.post("/query")
async def query_nlp(body: NLPQuestion):
    question = body.question.strip()

    if not question:
        raise HTTPException(
            status_code=422,
            detail="La question ne peut pas être vide.",
        )

    # --------------------------------------------------------
    # PEOPLE / HEALTH PREFERENCES
    # --------------------------------------------------------

    if is_person_question(question):
        try:
            analysis = analyze_question(question)
            sparql = generate_sparql(analysis)
        except ValueError as exc:
            raise HTTPException(
                status_code=422,
                detail=str(exc),
            ) from exc

        bindings = await execute_sparql(sparql)
        rows = format_bindings(bindings)

        return {
            "question": question,
            "domain": "health_preferences",
            "intent": analysis.intent,
            "entities": {
                "individual": analysis.entity,
                "label": analysis.label,
                "secondary_individual": analysis.secondary_entity,
                "secondary_label": analysis.secondary_label,
            },
            "sparql": sparql,
            "results": rows,
            "count": len(rows),
        }

    # --------------------------------------------------------
    # FOOD / NUTRITION / ENVIRONMENT
    # --------------------------------------------------------

    try:
        food_result = await nl2sparql.answer(question)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc

    if not food_result.get("nlp", {}).get("intent"):
        raise HTTPException(
            status_code=422,
            detail=food_result.get(
                "answer",
                "Question non reconnue.",
            ),
        )

    rows = food_result.get("rows", [])

    return {
        "question": question,
        "domain": "food_nutrition",
        "intent": food_result["nlp"]["intent"],
        "entities": food_result["nlp"]["entities"],
        "sparql": food_result["sparql"],
        "results": rows,
        "count": len(rows),
        "answer": food_result.get("answer"),
        "confidence": food_result["nlp"].get("confidence"),
        "boolean": food_result.get("boolean"),
    }
# ============================================================
# SEMANTIC MEAL PLANNER
# ============================================================

from fastapi import Query

MEAL_PLANNER_PREFIX = """
PREFIX eh: <http://www.semanticweb.org/thinkpad/ontologies/2026/9/EatHealthy#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
"""


@router.get("/meal-plan")
async def get_meal_plan(
    objective: str = Query(default="weight_loss"),
):
    """
    Generate a daily meal plan from the RDF ontology.

    The endpoint retrieves existing meals from Fuseki.
    It does not invent foods or nutritional quantities.
    """

    objectives = {
        "weight_loss": "ObjectifPertePoids1",
    }

    if objective not in objectives:
        raise HTTPException(
            status_code=422,
            detail="Objectif non pris en charge.",
        )

    objective_id = objectives[objective]

    sparql = MEAL_PLANNER_PREFIX + f"""
    SELECT
        ?type
        ?repas
        (GROUP_CONCAT(DISTINCT ?nomAliment; separator=", ") AS ?aliments)
    WHERE {{
        VALUES ?type {{
            eh:PetitDejeuner
            eh:Dejeuner
            eh:Diner
        }}

        ?repas a ?type ;
               eh:repasAdapteAObjectif eh:{objective_id} ;
               eh:contientAliment ?aliment .

        BIND(
            REPLACE(STR(?aliment), "^.*[#/]", "")
            AS ?nomAliment
        )
    }}
    GROUP BY ?type ?repas
    ORDER BY ?type ?repas
    """

    try:
        bindings = await execute_sparql(sparql)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Impossible d'interroger Fuseki.",
        ) from exc

    rows = format_bindings(bindings)

    categories = {
        "PetitDejeuner": {
            "label": "Petit-déjeuner",
            "icon": "sunrise",
            "options": [],
        },
        "Dejeuner": {
            "label": "Déjeuner",
            "icon": "sun",
            "options": [],
        },
        "Diner": {
            "label": "Dîner",
            "icon": "moon",
            "options": [],
        },
    }

    for row in rows:
        meal_type = row.get("type", "")
        meal_id = row.get("repas", "")
        food_string = row.get("aliments", "")

        if meal_type not in categories:
            continue

        foods = sorted({
            food.strip()
            for food in food_string.split(",")
            if food.strip()
        })

        categories[meal_type]["options"].append({
            "id": meal_id,
            "foods": foods,
        })

    meals = []

    for meal_type in ["PetitDejeuner", "Dejeuner", "Diner"]:
        category = categories[meal_type]

        meals.append({
            "type": meal_type,
            "label": category["label"],
            "icon": category["icon"],
            "options": category["options"],
            "count": len(category["options"]),
        })

    return {
        "objective": objective,
        "title": "Suggestions de repas pour votre journée",
        "description": (
            "Repas issus de l'ontologie EatHealthy, "
            "associés à un objectif de perte de poids."
        ),
        "meals": meals,
        "total_options": sum(meal["count"] for meal in meals),
        "source": "Apache Jena Fuseki",
        "disclaimer": (
            "Suggestions expérimentales basées sur les "
            "relations RDF. Les portions et les apports "
            "nutritionnels complets ne sont pas vérifiés."
        ),
    }