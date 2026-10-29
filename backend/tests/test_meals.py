"""Tests of the meal module "Repas" (run: python -m pytest backend/tests -q): SPARQL on rdflib, NLP questions, API."""

import asyncio

from rdflib import Namespace

from backend.queries import aliments as qa
from backend.queries import meals as q
from backend.services import nl2sparql
from backend.tests.test_aliments import ADMIN, CLIENT, ask, client, needs_fuseki, offline, offline_graph, summary, table

EH = Namespace(qa.EH)
assert offline   # the pytest fixture is used by name below


def meals_by_id(graph) -> dict:
    return {row["repas"]: row for row in table(graph, q.list_meals())}


def test_meal_crud_and_totals_on_rdflib():
    graph = offline_graph()
    lunch = meals_by_id(graph)["Dejeuner1"]   # Lentilles + Pomme + Saumon, one value per food
    assert (lunch["type"], lunch["aliments"], lunch["glucides"], lunch["calories"]) == ("Dejeuner", 3, 34, 376)
    graph.update(q.insert_meal("Repas_test", "PetitDejeuner", "Mon ftour", ["Banane", "PainBlanc"], "Personne1"))
    meal = meals_by_id(graph)["Repas_test"]
    assert (meal["nom"], meal["owner"], meal["glucides"], meal["proteines"]) == ("Mon ftour", "Personne1", 72, 10.1)
    graph.update(q.update_meal("Repas_test", "Collation", "Goûter", ["Pomme"]))
    meal = meals_by_id(graph)["Repas_test"]
    assert (meal["type"], meal["nom"], meal["aliments"], meal["calories"]) == ("Collation", "Goûter", 1, 52)
    graph.update(q.delete_meal("Repas_test"))
    assert "Repas_test" not in meals_by_id(graph) and (EH.Pomme, None, None) in graph   # foods are kept


def test_meal_questions(offline):
    assert summary(ask("Combien de glucides dans le déjeuner ?")) == [("Dejeuner1", None, 34)]   # (meal, name, total)
    assert summary(ask("Quels aliments contient le dîner ?")) == [("Diner1", "Brocoli"), ("Diner1", "Lentilles")]
    assert summary(ask("Quel repas est le plus calorique ?")) == [("Dejeuner1", None, 376)]
    assert ask("Calcule les nutriments du petit-déjeuner")["answer"] == "Aucun résultat."
    assert summary(ask("Combien de protéines dans le saumon ?")) == [("Saumon", 20)]


def test_new_meal_name_is_understood(offline):
    offline.update(q.insert_meal("Repas_test", "Diner", "Couscous du vendredi", ["Poulet", "Brocoli"], None))
    asyncio.run(nl2sparql.refresh())
    out = ask("Combien de protéines dans le couscous du vendredi ?")
    assert out["nlp"]["intent"] == "meal_total" and summary(out) == [("Repas_test", "Couscous du vendredi", 33.8)]


@needs_fuseki
def test_api_meal_crud_and_owner_rules():
    body = {"name": "Pytest repas", "type": "Dejeuner", "foods": ["Pomme", "Lentilles"]}
    meal_id = client.post("/api/meals", headers=ADMIN, json=body).json()["id"]
    try:
        meal = next(m for m in client.get("/api/meals", headers=ADMIN).json()["meals"] if m["id"] == meal_id)
        assert (meal["totals"]["glucides"], len(meal["foods"])) == (34, 2)
        assert client.put(f"/api/meals/{meal_id}", headers=CLIENT, json={"name": "Hack"}).status_code == 403
        assert client.delete(f"/api/meals/{meal_id}", headers=CLIENT).status_code == 403
        assert client.put(f"/api/meals/{meal_id}", headers=ADMIN, json={"foods": ["Pomme"]}).status_code == 200
        assert client.post("/api/meals", headers=ADMIN, json={**body, "foods": ["Utilisateur1"]}).status_code == 404
        assert client.get("/api/meals").status_code == 401
        assert any(f["id"] == "Pomme" and f["glucides"] == 14 for f in client.get("/api/meals/foods", headers=CLIENT).json()["foods"])
    finally:
        assert client.delete(f"/api/meals/{meal_id}", headers=ADMIN).status_code == 200
