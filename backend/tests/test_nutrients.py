"""Exercise the real nutrient API and SPARQL against an isolated RDF graph."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from rdflib import Graph, Namespace

from backend.auth import create_access_token
from backend.main import app
from backend.queries.aliments import EH
from backend.routers import nutrients

ADMIN = {"Authorization": "Bearer " + create_access_token("test-admin", "admin")}
CLIENT = {"Authorization": "Bearer " + create_access_token("test-client", "client")}


@pytest.fixture
def api(monkeypatch):
    graph = Graph().parse(Path(__file__).resolve().parents[2] / "ontology/eathealthy.rdf")

    async def select(query):
        return json.loads(graph.query(query).serialize(format="json"))["results"]["bindings"]

    async def update(query):
        graph.update(query)

    monkeypatch.setattr(nutrients, "execute_sparql", select)
    monkeypatch.setattr(nutrients, "execute_sparql_update", update)
    return TestClient(app), graph


def test_crud_and_associations(api):
    client, graph = api
    body = {"name": 'Vitamine "C"\nTest', "type": "Vitamine", "foods": ["Pomme", "Lentilles", "Pomme"]}
    response = client.post("/api/nutrients", json=body, headers=ADMIN)
    assert response.status_code == 201, response.text
    identifier = response.json()["id"]
    item = client.get(f"/api/nutrients/{identifier}").json()
    assert item["name"] == body["name"]
    assert {f["id"] for f in item["foods"]} == {"Pomme", "Lentilles"}
    assert identifier in {n["id"] for n in client.get("/api/nutrients?food=Pomme").json()["nutrients"]}
    # An inverse-only assertion must also be removed when associations change.
    ns = Namespace(EH)
    graph.add((ns[identifier], ns.estNutrimentDe, ns.Saumon))
    body.update(name="Fer test", type="Mineral", foods=["Brocoli"])
    assert client.put(f"/api/nutrients/{identifier}", json=body, headers=ADMIN).status_code == 200
    item = client.get(f"/api/nutrients/{identifier}").json()
    assert item["name"] == "Fer test" and item["type"] == "Mineral"
    assert [f["id"] for f in item["foods"]] == ["Brocoli"]
    assert client.delete(f"/api/nutrients/{identifier}", headers=ADMIN).status_code == 200
    assert client.get(f"/api/nutrients/{identifier}").status_code == 404
    assert (ns[identifier], None, None) not in graph
    assert (None, None, ns[identifier]) not in graph
    assert (ns.Brocoli, None, None) in graph


def test_permissions_and_invalid_input(api):
    client, graph = api
    before = len(graph)
    body = {"name": "Fer", "type": "Mineral", "foods": []}
    assert client.post("/api/nutrients", json=body).status_code == 401
    assert client.post("/api/nutrients", json=body, headers=CLIENT).status_code == 403
    assert client.put("/api/nutrients/Proteine1", json=body, headers=CLIENT).status_code == 403
    assert client.delete("/api/nutrients/Proteine1", headers=CLIENT).status_code == 403
    for changes in ({"name": "  "}, {"type": "Fruit"}, {"foods": ["Pomme} DROP ALL"]}):
        assert client.post("/api/nutrients", json={**body, **changes}, headers=ADMIN).status_code == 422
    assert client.post("/api/nutrients", json={**body, "foods": ["Absent"]}, headers=ADMIN).status_code == 404
    assert client.get("/api/nutrients?food=Absent").status_code == 404
    assert client.get("/api/nutrients?food=bad%7D").status_code == 400
    assert client.put("/api/nutrients/Absent", json=body, headers=ADMIN).status_code == 404
    assert len(graph) == before


def test_unlink_keeps_nutrient_and_food(api):
    client, graph = api
    body = {"name": "Protéine test", "type": "Proteine", "foods": []}
    identifier = client.post("/api/nutrients", json={**body, "foods": ["Lentilles"]}, headers=ADMIN).json()["id"]
    assert client.put(f"/api/nutrients/{identifier}", json=body, headers=ADMIN).status_code == 200
    assert client.get(f"/api/nutrients/{identifier}").json()["foods"] == []
    ns = Namespace(EH)
    assert (ns.Lentilles, ns.aProteines, None) in graph


def test_food_nutrition_matches_sheet_even_without_explicit_links(api):
    client, graph = api
    response = client.get("/api/nutrients/food/Banane/nutrition")
    assert response.status_code == 200
    data = response.json()
    values = {n["property"]: n["values"] for n in data["nutrition"]}
    assert values == {"aCalories": [89], "aProteines": [1.1], "aGlucides": [23],
                      "aLipides": [0.3], "aFibres": [2.6], "aSucre": [12], "aSodium": [1]}
    assert {n["name"] for n in data["associations"]} == {"Protéines", "Glucides", "Lipides", "Fibres", "Sucres", "Sodium"}
    assert len(data["associations"]) == 6
    # Nutrition is read from the same food property, not a copied value.
    graph.update('PREFIX eh: <' + EH + '> DELETE WHERE { eh:Banane eh:aProteines ?v }')
    graph.update('PREFIX eh: <' + EH + '> INSERT DATA { eh:Banane eh:aProteines 2.5 }')
    updated = client.get("/api/nutrients/food/Banane/nutrition").json()
    assert next(n for n in updated["nutrition"] if n["property"] == "aProteines")["values"] == [2.5]
    assert client.get("/api/nutrients/food/Absent/nutrition").status_code == 404


def test_catalogue_includes_every_asserted_nutrient_and_updates_live(api):
    client, graph = api
    data = client.get("/api/nutrients?food=Banane").json()
    assert data["count"] == 6
    for nutrient in data["nutrients"]:
        assert any(f["id"] == "Banane" and f.get("values") for f in nutrient["foods"])
    proteins = next(n for n in data["nutrients"] if n["name"] == "Protéines")
    assert next(f for f in proteins["foods"] if f["id"] == "Banane")["values"] == [1.1]
    assert client.delete("/api/nutrients/Proteine1", headers=ADMIN).status_code == 200
    ns = Namespace(EH)
    assert (None, ns.aProteines, None) not in graph
    graph.update('PREFIX eh: <' + EH + '> INSERT DATA { eh:Fromage a eh:ProduitLaitier }')
    assert client.get("/api/nutrients?food=Fromage").json()["count"] == 0


def test_admin_updates_real_composition_and_deletes_virtual_nutrient(api):
    client, graph = api
    before = client.get("/api/nutrients/Proteine1").json()
    amounts = {f["id"]: f.get("values", []) for f in before["foods"]}
    amounts["Banane"] = [8.25]
    body = {"name": "Protéines", "type": "Proteine", "foods": [f["id"] for f in before["foods"]], "amounts": amounts}
    response = client.put("/api/nutrients/Proteine1", json=body, headers=ADMIN)
    assert response.status_code == 200, response.text
    ns = Namespace(EH)
    assert [float(v) for v in graph.objects(ns.Banane, ns.aProteines)] == [8.25]
    assert [float(v) for v in graph.objects(ns.Lentilles, ns.aProteines)] == [9]
    data = client.get("/api/nutrients/food/Banane/nutrition").json()
    assert next(n for n in data["nutrition"] if n["property"] == "aProteines")["values"] == [8.25]
    assert client.get("/api/nutrients/NutritionLipides").status_code == 200
    assert client.delete("/api/nutrients/NutritionLipides", headers=ADMIN).status_code == 200
    assert (None, ns.aLipides, None) not in graph
    assert client.get("/api/nutrients/NutritionLipides").status_code == 404


def test_new_nutrient_quantities_persist_update_and_delete(api):
    client, graph = api
    body = {"name": "Fer test", "type": "Mineral", "foods": ["Banane"], "amounts": {"Banane": [0.5]}}
    response = client.post("/api/nutrients", json=body, headers=ADMIN)
    assert response.status_code == 201, response.text
    identifier = response.json()["id"]
    item = client.get(f"/api/nutrients/{identifier}").json()
    assert item["foods"][0]["values"] == [0.5]
    body.update(foods=["Pomme"], amounts={"Pomme": [0]})
    assert client.put(f"/api/nutrients/{identifier}", json=body, headers=ADMIN).status_code == 200
    item = client.get(f"/api/nutrients/{identifier}").json()
    assert item["foods"] == [{"id": "Pomme", "name": "Pomme", "values": [0]}]
    assert client.delete(f"/api/nutrients/{identifier}", headers=ADMIN).status_code == 200
    ns = Namespace(EH)
    assert (None, ns["teneur_" + identifier], None) not in graph
    assert client.post("/api/nutrients", json={**body, "amounts": {"Pomme": [-1]}}, headers=ADMIN).status_code == 422
    assert client.post("/api/nutrients", json={**body, "amounts": {"Banane": [1]}}, headers=ADMIN).status_code == 422


def test_fibres_creation_restores_food_sheet_and_persists_source(api):
    client, graph = api
    assert client.delete('/api/nutrients/NutritionFibres', headers=ADMIN).status_code == 200
    body = {'name': 'Fibres', 'type': 'Fibre', 'foods': ['Banane'], 'amounts': {'Banane': [2.6]},
            'sources': {'Banane': {'unit': 'g', 'basis': '100 g', 'preparation': 'Banane crue', 'source': 'https://example.org/test'}}}
    response = client.post('/api/nutrients', json=body, headers=ADMIN)
    assert response.status_code == 201, response.text
    assert response.json()['id'] == 'NutritionFibres'
    item = client.get('/api/nutrients/NutritionFibres').json()
    assert item['name'] == 'Fibres' and item['type'] == 'Fibre'
    assert item['sources'] == body['sources']
    ns = Namespace(EH)
    assert [float(v) for v in graph.objects(ns.Banane, ns.aFibres)] == [2.6]
    assert client.post('/api/nutrients', json=body, headers=ADMIN).status_code == 409


def test_categories_are_read_from_ontology_for_clients(api):
    client, graph = api
    response = client.get('/api/nutrients/categories')
    assert response.status_code == 200
    categories = {c['id'] for c in response.json()['categories']}
    assert {'Proteine', 'Glucide', 'Lipide', 'Vitamine', 'Mineral'} <= categories
    graph.update('PREFIX eh: <' + EH + '> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> INSERT DATA { eh:Fibre rdfs:subClassOf eh:Glucide }')
    assert 'Fibre' in {c['id'] for c in client.get('/api/nutrients/categories').json()['categories']}


def test_category_admin_rename_delete_and_protect_nonempty(api):
    client, graph = api
    url = '/api/nutrients/categories/Vitamine'
    assert client.put(url, json={'name': 'Vitamines essentielles'}).status_code == 401
    assert client.put(url, json={'name': 'Vitamines essentielles'}, headers=CLIENT).status_code == 403
    assert client.delete(url, headers=CLIENT).status_code == 403
    assert client.put(url, json={'name':' '}, headers=ADMIN).status_code == 422
    assert client.put(url, json={'name':'Vitamines essentielles'}, headers=ADMIN).status_code == 200
    assert next(c for c in client.get('/api/nutrients/categories').json()['categories'] if c['id']=='Vitamine')['name'] == 'Vitamines essentielles'
    assert client.delete('/api/nutrients/categories/Glucide', headers=ADMIN).status_code == 409
    assert client.delete(url, headers=ADMIN).status_code == 200
    assert 'Vitamine' not in {c['id'] for c in client.get('/api/nutrients/categories').json()['categories']}
    assert client.delete(url, headers=ADMIN).status_code == 404
    ns = Namespace(EH)
    assert (ns.Vitamine,None,None) not in graph and (None,None,ns.Vitamine) not in graph


def test_category_with_children_cannot_be_deleted(api):
    client, graph = api
    graph.update('PREFIX eh: <' + EH + '> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> INSERT DATA { eh:SousVitamine rdfs:subClassOf eh:Vitamine }')
    assert client.delete('/api/nutrients/categories/Vitamine', headers=ADMIN).status_code == 409


def test_admin_can_create_category_and_use_it_for_nutrient(api):
    client, graph = api
    url = '/api/nutrients/categories'
    assert client.post(url, json={'name':'Acides aminés'}, headers=CLIENT).status_code == 403
    assert client.post(url, json={'name':'Glucides'}, headers=ADMIN).status_code == 409
    result = client.post(url, json={'name':'Acides aminés'}, headers=ADMIN)
    assert result.status_code == 201, result.text
    category = result.json()
    assert category in client.get(url).json()['categories']
    assert client.post(url, json={'name':'ACIDES AMINES'}, headers=ADMIN).status_code == 409
    body = {'name':'Leucine test', 'type':category['id'], 'foods':['Banane'], 'amounts':{'Banane':[0.1]}}
    nutrient = client.post('/api/nutrients', json=body, headers=ADMIN)
    assert nutrient.status_code == 201, nutrient.text
    identifier = nutrient.json()['id']
    item = client.get('/api/nutrients/' + identifier).json()
    assert item['type'] == category['id'] and item['name'] == 'Leucine test'
    assert client.delete(url + '/' + category['id'], headers=ADMIN).status_code == 409
    assert client.delete('/api/nutrients/' + identifier, headers=ADMIN).status_code == 200
    assert client.delete(url + '/' + category['id'], headers=ADMIN).status_code == 200
