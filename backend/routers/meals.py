"""Meal API (module "Repas"): a user makes a breakfast, lunch, dinner or snack from foods; the nutrients are summed."""

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.auth import current_account
from backend.queries import aliments as qa
from backend.queries import meals as q
from backend.services import nl2sparql
from backend.services.fuseki_service import execute_sparql, execute_sparql_update

router = APIRouter(prefix="/api/meals", tags=["Meals"])

MealType = Literal["PetitDejeuner", "Dejeuner", "Diner", "Collation"]


class MealCreate(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    type: MealType
    foods: list[str] = Field(min_length=1, max_length=20)


class MealUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=60)
    type: MealType | None = None
    foods: list[str] | None = Field(default=None, min_length=1, max_length=20)


def nutrients(row: dict) -> dict:
    return {key: qa.value(row.get(key)) for key in q.NUTRIENTS.values()}


async def person_of(account: dict) -> str | None:
    """The Personne behind the logged-in account (None for a test token). The token holds a URI or a local name."""
    account_id = account["id"].rsplit("#", 1)[-1]
    if not qa.valid_id(account_id):
        return None
    rows = await execute_sparql(q.account_person(account_id))
    return qa.value(rows[0]["person"]) if rows else None


async def check_foods(food_ids: list[str]) -> list[str]:
    """404 if one ID is not a food. Returns the IDs without duplicates."""
    food_ids = list(dict.fromkeys(food_ids))
    known = {qa.value(r["aliment"]) for r in await execute_sparql(q.known_foods(food_ids))} \
        if all(qa.valid_id(f) for f in food_ids) else set()
    missing = [f for f in food_ids if f not in known]
    if missing:
        raise HTTPException(status_code=404, detail=f"Unknown food: {', '.join(missing)}.")
    return food_ids


async def ensure_can_change(meal_id: str, account: dict) -> None:
    """404 if not a meal; 403 if it is not your meal (admins can change every meal)."""
    if not qa.valid_id(meal_id):
        raise HTTPException(status_code=400, detail="Invalid meal identifier.")
    rows = await execute_sparql(q.meal_owner(meal_id))
    if not rows:
        raise HTTPException(status_code=404, detail=f"Meal '{meal_id}' not found.")
    owner = qa.value(rows[0].get("owner"))
    if account["role"] != "admin" and (owner is None or owner != await person_of(account)):
        raise HTTPException(status_code=403, detail="You can only change your own meals.")


@router.get("")
async def get_meals(account: dict = Depends(current_account)):
    """All meals, with their foods and nutrient totals. "mine" = made by the logged-in user."""
    me = await person_of(account)
    foods: dict[str, list] = {}
    for row in await execute_sparql(q.meal_foods()):
        food = qa.value(row["aliment"])
        foods.setdefault(qa.value(row["repas"]), []).append({"id": food, "label": qa.value(row.get("label")) or food})
    meals = []
    for row in await execute_sparql(q.list_meals()):
        meal_id, owner = qa.value(row["repas"]), qa.value(row.get("owner"))
        meals.append({"id": meal_id, "type": qa.value(row["type"]), "name": qa.value(row.get("nom")) or meal_id,
                      "foods": foods.get(meal_id, []), "totals": nutrients(row), "owner": owner,
                      "mine": owner is not None and owner == me})
    return {"count": len(meals), "meals": meals}


@router.get("/foods")
async def get_food_nutrients(account: dict = Depends(current_account)):
    """Foods and their nutrients per 100 g, for the meal form."""
    rows = await execute_sparql(q.list_food_nutrients())
    return {"foods": [{"id": qa.value(r["aliment"]), "label": qa.value(r.get("label")) or qa.value(r["aliment"]),
                       **nutrients(r)} for r in rows]}


@router.post("", status_code=201)
async def create_meal(body: MealCreate, account: dict = Depends(current_account)):
    food_ids = await check_foods(body.foods)
    meal_id = f"Repas_{uuid.uuid4().hex[:8]}"
    await execute_sparql_update(q.insert_meal(meal_id, body.type, body.name.strip(), food_ids, await person_of(account)))
    await nl2sparql.refresh()   # the question box now knows this meal's name
    return {"id": meal_id, "message": f"Meal '{body.name}' created."}


@router.put("/{meal_id}")
async def update_meal(meal_id: str, body: MealUpdate, account: dict = Depends(current_account)):
    await ensure_can_change(meal_id, account)
    if body.name is None and body.type is None and body.foods is None:
        raise HTTPException(status_code=400, detail="Nothing to change.")
    food_ids = await check_foods(body.foods) if body.foods is not None else None
    await execute_sparql_update(q.update_meal(meal_id, body.type, body.name and body.name.strip(), food_ids))
    await nl2sparql.refresh()
    return {"id": meal_id, "message": f"Meal '{meal_id}' updated."}


@router.delete("/{meal_id}")
async def delete_meal(meal_id: str, account: dict = Depends(current_account)):
    await ensure_can_change(meal_id, account)
    await execute_sparql_update(q.delete_meal(meal_id))
    await nl2sparql.refresh()
    return {"id": meal_id, "message": f"Meal '{meal_id}' deleted."}
