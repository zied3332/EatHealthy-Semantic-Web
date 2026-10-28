"""Environmental impact API (module "Gestion des aliments"): ranking and CRUD of carbon and water footprints."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.auth import require_admin
from backend.queries import aliments as q
from backend.services.fuseki_service import execute_sparql, execute_sparql_update

router = APIRouter(prefix="/api/impacts", tags=["Environmental impacts"])


class ImpactCreate(BaseModel):
    food: str
    type: Literal["EmpreinteCarbone", "EmpreinteEau"]
    value: float = Field(ge=0, le=100000)
    source: str | None = Field(default=None, max_length=300)


class ImpactUpdate(BaseModel):
    value: float | None = Field(default=None, ge=0, le=100000)
    source: str | None = Field(default=None, max_length=300)


@router.get("")
async def get_impacts(type: str = "EmpreinteCarbone"):
    """All impacts of one type, highest value first."""
    if type not in q.IMPACTS:
        raise HTTPException(status_code=400, detail="Use type=EmpreinteCarbone or type=EmpreinteEau.")
    impacts = []
    for row in await execute_sparql(q.list_impacts(type)):
        number = q.value(row.get("value"))
        impacts.append({
            "id": q.value(row["impact"]),
            "type": type,
            "food": q.value(row["food"]),
            "food_label": q.value(row.get("label")),
            "value": number,
            "unit": q.value(row.get("unit")) or q.IMPACTS[type][1],
            "source": q.value(row.get("source")),
            "level": q.co2_level(number) if type == "EmpreinteCarbone" else None,
        })
    return {"type": type, "unit": q.IMPACTS[type][1], "count": len(impacts), "impacts": impacts}


async def ensure_impact(impact_id: str) -> None:
    """400 for a bad ID, 404 if the ID is not an impact."""
    if not q.valid_id(impact_id):
        raise HTTPException(status_code=400, detail="Invalid impact identifier.")
    if not await execute_sparql(q.is_impact(impact_id)):
        raise HTTPException(status_code=404, detail=f"Impact '{impact_id}' not found.")


@router.post("", status_code=201)
async def create_impact(body: ImpactCreate, admin: dict = Depends(require_admin)):
    if not q.valid_id(body.food) or not await execute_sparql(q.is_food(body.food)):
        raise HTTPException(status_code=404, detail=f"Food '{body.food}' not found.")
    impact_id = q.IMPACTS[body.type][0] + body.food
    if await execute_sparql(q.id_used(impact_id)):
        raise HTTPException(status_code=409, detail=f"'{body.food}' already has this impact. Edit it instead.")
    source = (body.source or "").strip() or q.DEFAULT_SOURCE
    await execute_sparql_update(q.insert_impact(body.food, body.type, body.value, source))
    return {"id": impact_id, "message": f"Impact '{impact_id}' created."}


@router.put("/{impact_id}")
async def update_impact(impact_id: str, body: ImpactUpdate, admin: dict = Depends(require_admin)):
    await ensure_impact(impact_id)
    source = (body.source or "").strip() or None
    if body.value is None and source is None:
        raise HTTPException(status_code=400, detail="Nothing to change.")
    await execute_sparql_update(q.update_impact(impact_id, body.value, source))
    return {"id": impact_id, "message": f"Impact '{impact_id}' updated."}


@router.delete("/{impact_id}")
async def delete_impact(impact_id: str, admin: dict = Depends(require_admin)):
    await ensure_impact(impact_id)
    await execute_sparql_update(q.delete_impact(impact_id))
    return {"id": impact_id, "message": f"Impact '{impact_id}' deleted."}
