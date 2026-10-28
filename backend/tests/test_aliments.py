"""Important tests of the food module (run: python -m pytest backend/tests -q): rdflib, API, AI box, HermiT."""

import asyncio
import json
import shutil
from pathlib import Path

import groq
import httpx
import pytest
from fastapi.testclient import TestClient
from rdflib import BNode, Graph, Literal, Namespace
from rdflib.namespace import RDF

from backend.auth import create_access_token
from backend.main import app
from backend.queries import aliments as q
from backend.scripts import check_aliments, setup_aliments
from backend.services import nl2sparql
from backend.services.fuseki_service import FUSEKI_ENDPOINT

ONTOLOGY = Path(__file__).resolve().parents[2] / "ontology"
EH = Namespace(q.EH)
XSD = Namespace(q.XSD)


def offline_graph(with_date: bool = True) -> Graph:
    """eathealthy.rdf + every setup update (+ the date of the demo), in memory."""
    graph = Graph().parse(ONTOLOGY / "eathealthy.rdf")
    for update in setup_aliments.updates():
        graph.update(update)
    if with_date:
        graph.update(q.insert_food("DatteDegletNour", "Fruit", {
            "label": "Datte Deglet Nour", "calories": 282, "price": 15, "organic": False, "local": True}))
        graph.update(q.insert_impact("DatteDegletNour", "EmpreinteCarbone", 1.05, q.DEFAULT_SOURCE))
        graph.update(q.insert_impact("DatteDegletNour", "EmpreinteEau", 153.5, q.DEFAULT_SOURCE))
    return graph


def table(graph: Graph, sparql: str):
    """Run a query on rdflib and convert it like the app does."""
    result = json.loads(graph.query(sparql).serialize(format="json"))
    if "boolean" in result:
        return result["boolean"]
    columns = result["head"]["vars"]
    return [{c: q.value(row.get(c)) for c in columns} for row in result["results"]["bindings"]]


# ---------------------------------------------------------------- ontology and helpers
def test_ttl_axioms_are_in_rdf_file():
    rdf = Graph().parse(ONTOLOGY / "eathealthy.rdf")
    ttl = Graph().parse(ONTOLOGY / "aliments-module.ttl")
    assert [t for t in ttl if not any(isinstance(x, BNode) for x in t) and t not in rdf] == []
    assert [float(v) for v in ttl.objects(None, XSD.maxInclusive)] == [q.LOW_CARBON_MAX]
    assert [float(v) for v in ttl.objects(None, XSD.minInclusive)] == [q.HIGH_CARBON_MIN]


def test_helpers():
    assert [q.make_id(x) for x in ("Datte Deglet Nour", "Pain blanc", "Bœuf", "Crème fraîche", "7 Up")] == \
        ["DatteDegletNour", "PainBlanc", "Boeuf", "CremeFraiche", "Aliment7Up"]
    assert q.dec(660.0) == '"660"^^xsd:decimal' and q.dec(1e-07) == '"0.0000001"^^xsd:decimal'
    assert not q.valid_id("x} ; DROP ALL") and q.valid_id("CO2_Pomme")
    assert [q.co2_level(v) for v in (None, 2, 5, 10)] == [None, "low", "medium", "high"]


# ---------------------------------------------------------------- SPARQL on rdflib
def test_setup_adds_data_once():
    graph = offline_graph(with_date=False)
    size = len(graph)
    for update in setup_aliments.updates():
        graph.update(update)
    assert len(graph) == size
    assert (EH.Boeuf, RDF.type, EH.Viande) in graph
    assert (EH.Eau_Poulet, EH.valeurImpact, Literal("660", datatype=XSD.decimal)) in graph


def test_food_crud_on_rdflib():
    graph = offline_graph()
    date = table(graph, q.list_foods("DatteDegletNour"))
    assert date == [{"food": "DatteDegletNour", "category": "Fruit", "label": "Datte Deglet Nour", "calories": 282,
                     "price": 15, "organic": False, "local": True, "co2": 1.05, "water": 153.5}]
    graph.update(q.update_food("DatteDegletNour", {"price": 12.5, "category": "Legume"}))
    assert list(graph.objects(EH.DatteDegletNour, EH.prixMoyen)) == [Literal("12.5", datatype=XSD.decimal)]
    assert table(graph, q.is_food("DatteDegletNour")) == [{"c": "Legume"}]
    graph.add((EH.Dejeuner1, EH.contientAliment, EH.DatteDegletNour))
    graph.update(q.delete_food("DatteDegletNour"))
    for name in ("DatteDegletNour", "CO2_DatteDegletNour", "Eau_DatteDegletNour"):
        assert (EH[name], None, None) not in graph and (None, None, EH[name]) not in graph


def test_impact_crud_and_ranking_on_rdflib():
    graph = offline_graph()
    carbon = table(graph, q.list_impacts("EmpreinteCarbone"))
    assert (carbon[0]["food"], carbon[0]["value"], carbon[-1]["food"]) == ("Boeuf", 99.48, "Pomme")
    graph.update(q.update_impact("CO2_DatteDegletNour", 1.2, "Test"))
    assert list(graph.objects(EH.CO2_DatteDegletNour, EH.valeurImpact)) == [Literal("1.2", datatype=XSD.decimal)]
    graph.update(q.delete_impact("CO2_DatteDegletNour"))
    assert (None, None, EH.CO2_DatteDegletNour) not in graph and not table(graph, q.is_impact("CO2_DatteDegletNour"))


# ---------------------------------------------------------------- AI box (no network)
EXPECTED = [  # section 6 of the module spec, with the date
    [("Pomme", 0.43), ("Datte Deglet Nour", 1.05)], [("Bœuf", 99.48)], [("Fromage", 5605.2)],
    [("Viande", 54.68), ("Poisson", 13.63), ("ProduitLaitier", 13.52), ("Cereale", 1.57), ("Legume", 1.15), ("Fruit", 0.78)],
    [(3,)], [("Brocoli", 34, 0.51), ("Pomme", 52, 0.43), ("Banane", 89, 0.86)], [("Brocoli", 0.51), ("Lentilles", 1.79)],
    False, [("Pomme", 0.43), ("Brocoli", 0.51), ("Datte Deglet Nour", 1.05), ("Pain blanc", 1.57), ("Lentilles", 1.79)],
]


def test_demo_queries_give_the_expected_answers():
    graph = offline_graph()
    for (question, sparql, _), expected in zip(nl2sparql.DEMO, EXPECTED):
        rows = table(graph, nl2sparql.check(sparql))
        if isinstance(rows, list):   # drop the ID column, round the numbers
            rows = [tuple(float(nl2sparql.number(v)) if isinstance(v, float) else v
                          for k, v in r.items() if k != "aliment") for r in rows]
        assert rows == expected, question


@pytest.mark.parametrize("bad", ["INSERT DATA { eh:X a eh:Fruit }", "DELETE WHERE { ?s ?p ?o }", "hello",
                                 "SELECT * WHERE { SERVICE <http://x.org/sparql> { ?s ?p ?o } }",
                                 "CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }",
                                 "SELECT ?s WHERE { ?s ?p ?o } SELECT ?o WHERE { ?s ?p ?o }"])
def test_check_rejects_unsafe_queries(bad):
    with pytest.raises(ValueError):
        nl2sparql.check(bad)


def test_check_adds_limit_and_ignores_strings():
    query = nl2sparql.check('PREFIX eh: <http://wrong#> SELECT ?copy WHERE { ?copy rdfs:label "Delete me" }')
    assert query.endswith("LIMIT 50") and "wrong" not in query


@pytest.fixture
def fake_ai(monkeypatch):
    """Fake Groq replies and an in-memory Fuseki."""
    graph, replies = offline_graph(), []
    monkeypatch.setenv("GROQ_API_KEY", "test")

    async def chat(messages):
        reply = replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply

    async def fetch(query):
        return json.loads(graph.query(query).serialize(format="json"))
    monkeypatch.setattr(nl2sparql, "chat", chat)
    monkeypatch.setattr(nl2sparql, "fetch", fetch)
    return replies


def reply(sparql, language="fr"):
    return json.dumps({"sparql": sparql, "explanation": "Test.", "language": language})


def test_ai_answer_with_one_retry_and_out_of_scope(fake_ai):
    fake_ai += [reply("DELETE WHERE { ?s ?p ?o }"), reply("SELECT (COUNT(?a) AS ?n) WHERE { ?a a eh:Fruit }")]
    out = asyncio.run(nl2sparql.answer("Combien de fruits ?"))
    assert (out["mode"], out["answer"], out["kind"]) == ("groq", "Résultat : 3", "select")
    assert out["sparql"].endswith("LIMIT 50") and fake_ai == []
    fake_ai.append(json.dumps({"sparql": "", "explanation": "Only foods, sorry.", "language": "en"}))
    out = asyncio.run(nl2sparql.answer("Who won the World Cup?"))   # out of scope: no query is run
    assert (out["answer"], out["kind"]) == ("Only foods, sorry.", None)


def test_ai_busy_uses_saved_query_or_says_busy(fake_ai):
    busy = groq.APIConnectionError(request=httpx.Request("POST", "https://api.groq.com"))
    fake_ai += [busy, busy]
    saved = asyncio.run(nl2sparql.answer("Which foods are sustainable?"))
    assert saved["mode"] == "example" and saved["answer"].startswith("I found 5 results: Pomme (0.43)")
    other = asyncio.run(nl2sparql.answer("Quel est le meilleur fromage ?"))
    assert (other["mode"], other["answer"], other["kind"]) == ("none", nl2sparql.BUSY, None)


# ---------------------------------------------------------------- API on the real Fuseki
def fuseki_up() -> bool:
    try:
        return httpx.post(FUSEKI_ENDPOINT, data={"query": "ASK {}"}, timeout=3).status_code == 200
    except httpx.HTTPError:
        return False


needs_fuseki = pytest.mark.skipif(not fuseki_up(), reason="Fuseki is not running")
ADMIN = {"Authorization": "Bearer " + create_access_token("Account_pytest_admin", "admin")}
CLIENT = {"Authorization": "Bearer " + create_access_token("Account_pytest_client", "client")}
client = TestClient(app)


@needs_fuseki
def test_api_keeps_old_keys():
    foods = client.get("/api/foods").json()
    pomme = next(f for f in foods["foods"] if f["name"] == "Pomme")
    assert {"count", "foods"} <= set(foods) and {"uri", "name", "category"} <= set(pomme)
    assert (pomme["co2_level"], pomme["sustainable"]) == ("low", True)
    details = client.get("/api/foods/Pomme").json()
    assert {"name", "uri", "properties_count", "properties"} <= set(details) and details["co2"] == 0.43
    assert client.get("/api/diets").status_code == client.get("/api/profile/options").status_code == 200


@needs_fuseki
def test_api_food_and_impact_crud():
    body = {"name": "Pytest Aliment", "category": "Cereale", "calories": 120, "local": True}
    try:
        assert client.post("/api/foods", headers=ADMIN, json=body).json()["id"] == "PytestAliment"
        assert client.post("/api/foods", headers=ADMIN, json=body).status_code == 409
        assert client.put("/api/foods/PytestAliment", headers=ADMIN, json={"calories": 130}).status_code == 200
        impact = {"food": "PytestAliment", "type": "EmpreinteCarbone", "value": 1.5}
        assert client.post("/api/impacts", headers=ADMIN, json=impact).status_code == 201
        assert client.post("/api/impacts", headers=ADMIN, json=impact).status_code == 409
        assert client.put("/api/impacts/CO2_PytestAliment", headers=ADMIN, json={"value": 12}).status_code == 200
        food = client.get("/api/foods/PytestAliment").json()
        assert (food["calories"], food["co2"], food["co2_level"]) == (130, 12, "high")
        assert len([p for p in food["properties"] if p["property"] == "aCalories"]) == 1   # TDB2 decimal fix
        assert client.delete("/api/impacts/CO2_PytestAliment", headers=ADMIN).status_code == 200
        assert client.delete("/api/foods/Utilisateur1", headers=ADMIN).status_code == 404   # never a person
    finally:
        client.delete("/api/foods/PytestAliment", headers=ADMIN)
    assert client.get("/api/foods/PytestAliment").status_code == 404


@needs_fuseki
def test_api_writes_need_admin():
    assert client.post("/api/foods", headers=CLIENT, json={"name": "Xx", "category": "Fruit", "calories": 1}).status_code == 403
    assert client.delete("/api/impacts/CO2_Pomme", headers=CLIENT).status_code == 403
    assert client.put("/api/foods/Pomme", json={"price": 1}).status_code == 401
    assert client.post("/api/foods/ask", json={"question": "Combien de fruits ?"}).status_code == 401


# ---------------------------------------------------------------- HermiT (needs Java)
needs_java = pytest.mark.skipif(shutil.which("java") is None, reason="Java is not installed (HermiT needs it)")


@needs_java
def test_hermit_infers_the_three_classes(tmp_path):
    classes = check_aliments.run_hermit(offline_graph(), tmp_path / "demo.owl")
    assert classes == {
        "AlimentFaibleCarbone": ["Banane", "Brocoli", "DatteDegletNour", "Lentilles", "PainBlanc", "Pomme"],
        "AlimentFortCarbone": ["Boeuf", "Fromage", "Saumon"],
        "AlimentDurable": ["Brocoli", "DatteDegletNour", "Lentilles", "PainBlanc", "Pomme"]}


@needs_java
def test_hermit_finds_mistakes(tmp_path):
    graph = offline_graph()
    graph.add((EH.Pomme, RDF.type, EH.Viande))   # Fruit and Viande are disjoint
    assert check_aliments.run_hermit(graph, tmp_path / "bad1.owl") is None
    graph = offline_graph()
    graph.add((EH.CO2_Pomme, EH.valeurImpact, Literal("5.5", datatype=XSD.decimal)))   # functional property
    assert check_aliments.run_hermit(graph, tmp_path / "bad2.owl") is None
