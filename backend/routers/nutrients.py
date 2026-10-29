"""Nour's nutrient CRUD. Reads are public; writes follow the project's admin policy."""
import uuid
import json
import unicodedata
from typing import Literal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.auth import require_admin
from backend.queries import nutrients as q
from backend.queries.aliments import is_food, valid_id, value
from backend.services.fuseki_service import execute_sparql, execute_sparql_update
from backend.services import nutrient_ai
from backend.queries.aliments import list_foods

router = APIRouter(prefix="/api/nutrients", tags=["Nutrients"])


class NutrientBody(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=2, max_length=80)
    type: str = Field(pattern=r"^[A-Za-z][A-Za-z0-9_]*$")
    foods: list[str] = Field(default_factory=list, max_length=200)
    amounts: dict[str, list[Annotated[float, Field(ge=0, allow_inf_nan=False)]]] = Field(default_factory=dict)
    sources: dict[str, "QuantitySource"] = Field(default_factory=dict)

    @field_validator("foods")
    @classmethod
    def safe_foods(cls, foods):
        if any(not valid_id(food) for food in foods):
            raise ValueError("Invalid food identifier")
        return list(dict.fromkeys(foods))


class QuantitySource(BaseModel):
    model_config = ConfigDict(extra="forbid")
    unit: Literal["g", "mg", "µg"]
    basis: Literal["100 g"]
    preparation: str = Field(min_length=1, max_length=200)
    source: str = Field(max_length=2000, pattern=r"^https://")


NutrientBody.model_rebuild()


def check_id(identifier):
    if not valid_id(identifier):
        raise HTTPException(400, "Invalid identifier")


def rows_to_nutrients(rows):
    result = {}
    for row in rows:
        identifier = value(row["nutrient"])
        nutrient_type = value(row["type"])
        item = result.setdefault(identifier, {"id": identifier, "name": q.TYPE_LABELS.get(nutrient_type, identifier), "type": nutrient_type, "foods": []})
        if row.get("label"):
            item["name"] = value(row["label"])
        if row.get("sourceData"):
            try:
                item["sources"] = json.loads(value(row["sourceData"]))
            except (TypeError, ValueError):
                item["sources"] = {}
        food = value(row.get("food"))
        if food and not any(f["id"] == food for f in item["foods"]):
            item["foods"].append({"id": food, "name": value(row.get("foodLabel")) or food})
    return list(result.values())


async def catalogue(food=None):
    """Unify explicit nutrient links with the asserted food composition, without copying data."""
    items = {item["id"]: {**item, "composition": False} for item in
             rows_to_nutrients(await execute_sparql(q.list_nutrients()))}
    for row in await execute_sparql(q.all_nutrition()):
        prop = value(row["property"])
        if prop in q.STANDARD_NUTRIENTS:
            identifier, label, kind = q.STANDARD_NUTRIENTS[prop]
        else:
            identifier, label, kind = value(row["owner"]), value(row.get("ownerLabel")) or value(row["owner"]), value(row["ownerType"])
        item = items.setdefault(identifier, {"id": identifier, "name": label, "type": kind, "foods": []})
        item.update(composition=True, property=prop)
        food_id = value(row["food"])
        association = next((f for f in item["foods"] if f["id"] == food_id), None)
        if association is None:
            association = {"id": food_id, "name": value(row.get("foodLabel")) or food_id}
            item["foods"].append(association)
        association.setdefault("values", [])
        number = value(row["value"])
        if number not in association["values"]:
            association["values"].append(number)
    return sorted((item for item in items.values() if not food or any(f["id"] == food for f in item["foods"])), key=lambda item: item["name"])


async def ensure_nutrient(identifier):
    check_id(identifier)
    items = [item for item in await catalogue() if item["id"] == identifier]
    if not items:
        raise HTTPException(404, "Nutrient not found")
    return items[0]


async def check_foods(foods):
    for food in foods:
        if not await execute_sparql(is_food(food)):
            raise HTTPException(404, f"Food '{food}' not found")


def check_amounts(body):
    if any(food not in body.foods or not valid_id(food) for food in body.amounts):
        raise HTTPException(422, "Les quantités doivent correspondre aux aliments sélectionnés.")
    if any(food not in body.foods for food in body.sources):
        raise HTTPException(422, "Les sources doivent correspondre aux aliments sélectionnés.")


def source_data(body):
    return {food: source.model_dump() for food, source in body.sources.items()}


def standard_for(name):
    normalized = ''.join(c for c in unicodedata.normalize('NFKD', name.lower()) if not unicodedata.combining(c)).strip()
    aliases = {"fibres alimentaires": "aFibres", "fibre": "aFibres", "fibres": "aFibres",
               "proteine": "aProteines", "proteines": "aProteines", "glucide": "aGlucides", "glucides": "aGlucides",
               "lipide": "aLipides", "lipides": "aLipides", "sucre": "aSucre", "sucres": "aSucre", "sodium": "aSodium"}
    return aliases.get(normalized)


def property_for(item):
    return item.get("property") or next((p for p, meta in q.STANDARD_NUTRIENTS.items() if meta[0] == item["id"]), "teneur_" + item["id"])


@router.get("")
async def get_nutrients(food: str | None = None):
    if food:
        check_id(food)
        await check_foods([food])
    items = await catalogue(food)
    return {"count": len(items), "nutrients": items}


class SuggestionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=2, max_length=80)
    category: str = Field(pattern=r"^[A-Za-z][A-Za-z0-9_]*$")


async def build_suggestion(body):
    foods = {}
    for row in await execute_sparql(list_foods()):
        identifier = value(row["food"])
        foods[identifier] = {"id": identifier, "name": value(row.get("label")) or identifier}
    category_label = next((value(row.get('label')) or value(row['category']) for row in await execute_sparql(q.list_categories()) if value(row['category']) == body.category), body.category)
    return await nutrient_ai.suggest(body.name, list(foods.values()), await catalogue(), body.category, category_label)


@router.post("/suggest")
async def suggest_nutrient(body: SuggestionRequest, admin: dict = Depends(require_admin)):
    return await build_suggestion(body)


@router.get("/categories")
async def get_categories():
    categories = {}
    labels = {"Proteine": "Protéines", "Glucide": "Glucides", "Lipide": "Lipides", "Vitamine": "Vitamines", "Mineral": "Minéraux", "Fibre": "Fibres"}
    for row in await execute_sparql(q.list_categories()):
        identifier = value(row["category"])
        categories[identifier] = {"id": identifier, "name": value(row.get("label")) or labels.get(identifier, identifier)}
    return {"categories": list(categories.values())}


class CategoryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=2, max_length=80)


@router.post("/categories", status_code=201)
async def create_category(body: CategoryUpdate, admin: dict = Depends(require_admin)):
    data = await get_categories()
    for category in data['categories']:
        if nutrient_ai.normalized_name(body.name) in {nutrient_ai.normalized_name(category['name']), nutrient_ai.normalized_name(category['id'])}:
            raise HTTPException(409, "Une catégorie portant ce nom existe déjà.")
    identifier = "Categorie_" + uuid.uuid4().hex
    await execute_sparql_update(q.PREFIXES + f"INSERT DATA {{ eh:{identifier} a owl:Class ; rdfs:subClassOf eh:Nutriment ; rdfs:label {json.dumps(body.name, ensure_ascii=False)}@fr }}")
    return {"id": identifier, "name": body.name}


async def ensure_category(identifier):
    check_id(identifier)
    if not any(value(row['category']) == identifier for row in await execute_sparql(q.list_categories())):
        raise HTTPException(404, "Catégorie introuvable dans l’ontologie.")


async def validate_nutrient_category(identifier):
    if identifier == 'Fibre':
        return
    try:
        await ensure_category(identifier)
    except HTTPException as exc:
        raise HTTPException(422, "Choisissez une catégorie de nutriments existante.") from exc


@router.put("/categories/{identifier}")
async def update_category(identifier: str, body: CategoryUpdate, admin: dict = Depends(require_admin)):
    await ensure_category(identifier)
    await execute_sparql_update(q.rename_category(identifier, body.name))
    return {"id": identifier, "name": body.name}


@router.delete("/categories/{identifier}")
async def delete_category(identifier: str, admin: dict = Depends(require_admin)):
    await ensure_category(identifier)
    children = await execute_sparql(q.PREFIXES + f"SELECT ?child WHERE {{ ?child rdfs:subClassOf+ eh:{identifier} }} LIMIT 1")
    if children:
        raise HTTPException(409, "Cette catégorie possède des sous-catégories. Retirez-les avant de la supprimer.")
    if any(item['type'] == identifier for item in await catalogue()):
        raise HTTPException(409, "Cette catégorie contient des nutriments. Déplacez-les ou supprimez-les avant de supprimer la catégorie.")
    await execute_sparql_update(q.many(q.delete_all(f"eh:{identifier}")))
    return {"id": identifier, "message": "Catégorie supprimée de l’ontologie."}


@router.get("/{identifier}")
async def get_nutrient(identifier: str):
    return await ensure_nutrient(identifier)


@router.get("/food/{identifier}/nutrition")
async def get_food_nutrition(identifier: str):
    """Return the same asserted nutrition values as the food sheet, plus explicit links."""
    check_id(identifier)
    await check_foods([identifier])
    rows = await execute_sparql(q.food_nutrition(identifier))
    fields = {key: [] for key in q.NUTRITION_FIELDS}
    for row in rows:
        fields[value(row["property"])].append(value(row["value"]))
    return {"food": identifier, "nutrition": [
        {"property": key, "name": label, "values": fields[key]}
        for key, label in q.NUTRITION_FIELDS.items()
    ], "associations": await catalogue(identifier), "categories": (await get_categories())["categories"]}


@router.post("", status_code=201)
async def create_nutrient(body: NutrientBody, admin: dict = Depends(require_admin)):
    check_amounts(body)
    await validate_nutrient_category(body.type)
    await check_foods(body.foods)
    prop = standard_for(body.name)
    identifier = q.STANDARD_NUTRIENTS[prop][0] if prop else "Nutriment_" + uuid.uuid4().hex
    if prop and any(item["id"] == identifier for item in await catalogue()):
        raise HTTPException(409, "Ce nutriment existe déjà. Utilisez Modifier / valeurs.")
    if prop and body.type != q.STANDARD_NUTRIENTS[prop][2]:
        raise HTTPException(422, "Choisissez la catégorie correspondant au nutriment.")
    await execute_sparql_update(q.save_nutrient(identifier, body.name, body.type, body.foods, creating=True) + " ;\n" + q.quantity_update(identifier, prop or "teneur_" + identifier, body.foods, body.amounts) + " ;\n" + q.save_sources(identifier, source_data(body)))
    return {"id": identifier}


@router.put("/{identifier}")
async def update_nutrient(identifier: str, body: NutrientBody, admin: dict = Depends(require_admin)):
    current = await ensure_nutrient(identifier)
    check_amounts(body)
    await validate_nutrient_category(body.type)
    await check_foods(body.foods)
    prop = property_for(current)
    if prop in q.STANDARD_NUTRIENTS and body.type != q.STANDARD_NUTRIENTS[prop][2]:
        raise HTTPException(422, "Le type de ce nutriment standard est fixe.")
    amounts = body.amounts if "amounts" in body.model_fields_set else {f["id"]: f.get("values", []) for f in current["foods"]}
    sources = source_data(body) if "sources" in body.model_fields_set else {k: v for k, v in current.get("sources", {}).items() if k in body.foods}
    await execute_sparql_update(q.save_nutrient(identifier, body.name, body.type, body.foods) + " ;\n" + q.quantity_update(identifier, prop, body.foods, amounts) + " ;\n" + q.save_sources(identifier, sources))
    return {"id": identifier}


@router.delete("/{identifier}")
async def delete_nutrient(identifier: str, admin: dict = Depends(require_admin)):
    current = await ensure_nutrient(identifier)
    await execute_sparql_update(q.delete_quantities(property_for(current)) + " ;\n" + q.delete_nutrient(identifier))
    return {"id": identifier, "message": "Nutrient and its associations deleted"}
