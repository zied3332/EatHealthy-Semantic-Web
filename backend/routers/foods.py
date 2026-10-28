"""
Food API routes for EatHealthy.

Retrieves food individuals, categories, and semantic
properties from the ontology using SPARQL.
Module "Gestion des aliments": food CRUD (admin) and the AI question box.
"""

import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.auth import current_account, require_admin
from backend.queries import aliments as q
from backend.queries.nutrition import FOOD_DETAILS_QUERY
from backend.services import nl2sparql
from backend.services.fuseki_service import execute_sparql, execute_sparql_update


router = APIRouter(
    prefix="/api/foods",
    tags=["Foods"],
)

Category = Literal["Fruit", "Legume", "Cereale", "Viande", "Poisson", "ProduitLaitier"]


class FoodCreate(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    category: Category
    calories: float = Field(ge=0, le=900)
    price: float | None = Field(default=None, gt=0)
    organic: bool = False
    local: bool = False


class FoodUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=60)
    category: Category | None = None
    calories: float | None = Field(default=None, ge=0, le=900)
    price: float | None = Field(default=None, gt=0)
    organic: bool | None = None
    local: bool | None = None


class Question(BaseModel):
    question: str = Field(min_length=3, max_length=300)


def local_name(uri: str) -> str:
    """
    Extract the local name from an RDF URI.

    Example:
    http://example.org#Pomme -> Pomme
    """
    return uri.rsplit("#", 1)[-1].rsplit("/", 1)[-1]


def food_rows(bindings: list[dict]) -> list[dict]:
    """One dict per food (duplicate rows merged), with its CO2 level."""
    foods = {}
    for row in bindings:
        uri = row["food"]["value"]
        food = foods.setdefault(uri, {
            "uri": uri,
            "name": local_name(uri),
            "category": local_name(row["category"]["value"]),
        })
        for key in ("label", "calories", "price", "organic", "local", "co2", "water"):
            if food.get(key) is None:
                food[key] = q.value(row.get(key))
    for food in foods.values():
        food["co2_level"] = q.co2_level(food["co2"])
        food["sustainable"] = food["co2_level"] == "low" and food["local"] is True
    return list(foods.values())


@router.get("")
async def get_foods():
    """
    Retrieve foods, their categories and footprints from Fuseki.
    """
    foods = food_rows(await execute_sparql(q.list_foods()))
    return {
        "count": len(foods),
        "foods": foods,
    }


# ---------------------------------------------------------------- AI question box

@router.get("/ask/examples")
async def get_examples():
    """The 9 demo questions, shown as buttons."""
    return {"questions": nl2sparql.demo_questions()}


@router.post("/ask")
async def ask(body: Question, account: dict = Depends(current_account)):
    """Question -> Groq writes SPARQL -> Fuseki runs it -> answer."""
    return await nl2sparql.answer(body.question)


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

    details = {
        "name": food_name,
        "uri": (
            "http://www.semanticweb.org/thinkpad/"
            "ontologies/2026/9/EatHealthy#"
            f"{food_name}"
        ),
        "properties_count": len(properties),
        "properties": properties,
    }

    # Module "Gestion des aliments": label, values and footprints.
    if q.valid_id(food_name):
        rows = food_rows(await execute_sparql(q.list_foods(food_name)))
        if rows:
            details.update(rows[0])
    return details


# ---------------------------------------------------------------- food CRUD (admin)

async def ensure_food(food_id: str) -> None:
    """400 for a bad ID, 404 if the ID is not a food (so we never delete a person)."""
    if not q.valid_id(food_id):
        raise HTTPException(status_code=400, detail="Invalid food identifier.")
    if not await execute_sparql(q.is_food(food_id)):
        raise HTTPException(status_code=404, detail=f"Food '{food_id}' not found.")


@router.post("", status_code=201)
async def create_food(body: FoodCreate, admin: dict = Depends(require_admin)):
    try:
        food_id = q.make_id(body.name)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if await execute_sparql(q.id_used(food_id)):
        raise HTTPException(status_code=409, detail=f"The ID '{food_id}' is already used.")
    fields = body.model_dump(exclude={"name", "category"})
    await execute_sparql_update(q.insert_food(food_id, body.category, {"label": body.name.strip(), **fields}))
    return {"id": food_id, "message": f"Food '{body.name}' created."}


@router.put("/{food_id}")
async def update_food(food_id: str, body: FoodUpdate, admin: dict = Depends(require_admin)):
    await ensure_food(food_id)
    changes = body.model_dump(exclude_none=True)
    if "name" in changes:
        changes["label"] = changes.pop("name").strip()
    if not changes:
        raise HTTPException(status_code=400, detail="Nothing to change.")
    await execute_sparql_update(q.update_food(food_id, changes))
    return {"id": food_id, "message": f"Food '{food_id}' updated."}


@router.delete("/{food_id}")
async def delete_food(food_id: str, admin: dict = Depends(require_admin)):
    await ensure_food(food_id)
    await execute_sparql_update(q.delete_food(food_id))
    return {"id": food_id, "message": f"Food '{food_id}' deleted."}
