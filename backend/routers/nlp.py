
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
