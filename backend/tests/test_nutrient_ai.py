import asyncio
import json

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.auth import create_access_token
from backend.main import app
from backend.services import nutrient_ai


@pytest.fixture(autouse=True)
def clear_suggestion_cache():
    nutrient_ai._CACHE.clear()
    yield
    nutrient_ai._CACHE.clear()


def mock_claude(monkeypatch, proposal, status=200, urls=None):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-not-real")
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, url, **kwargs):
            return httpx.Response(status, json={"content": [*[{"type": "web_search_result", "url": url} for url in (urls or [])], {"type": "text", "text": json.dumps(proposal)}], "stop_reason": "end_turn"})
    monkeypatch.setattr(nutrient_ai.httpx, "AsyncClient", Client)


def test_new_suggestion_has_no_fabricated_quantities(monkeypatch):
    mock_claude(monkeypatch, {"name": "Fer", "type": "Mineral", "foods": ["Lentilles"], "existing_id": None, "explanation": "Le fer est un minéral."})
    data = asyncio.run(nutrient_ai.suggest("fer", [{"id": "Lentilles"}], []))
    assert data["type"] == "Mineral" and data["foods"] == ["Lentilles"]
    assert data["amounts"] == {} and data["quantity_source"] == "unknown"


def test_existing_values_are_taken_from_database(monkeypatch):
    mock_claude(monkeypatch, {"name": "Protéines", "type": "Proteine", "foods": [], "existing_id": "Proteine1", "explanation": "Nutriment existant."})
    data = asyncio.run(nutrient_ai.suggest("proteine", [{"id": "Banane"}], [{"id": "Proteine1", "name": "Protéines", "type": "Proteine", "foods": [{"id": "Banane", "values": [1.1]}]}]))
    assert data["amounts"] == {"Banane": [1.1]}
    assert data["foods"] == ["Banane"] and data["quantity_source"] == "Fuseki"


@pytest.mark.parametrize("status", [401, 429, 500])
def test_provider_errors_are_sanitized(monkeypatch, status):
    mock_claude(monkeypatch, {}, status)
    with pytest.raises(HTTPException) as error:
        asyncio.run(nutrient_ai.suggest("Fer", [], []))
    assert error.value.status_code in (502, 503)
    assert "test-not-real" not in error.value.detail


def test_rejects_unknown_food_and_no_key(monkeypatch):
    mock_claude(monkeypatch, {"name": "Fer", "type": "Mineral", "foods": ["Invented"], "existing_id": None, "explanation": "Test"})
    with pytest.raises(HTTPException) as error:
        asyncio.run(nutrient_ai.suggest("Fer", [], []))
    assert error.value.status_code == 502
    monkeypatch.delenv("ANTHROPIC_API_KEY")
    with pytest.raises(HTTPException) as error:
        asyncio.run(nutrient_ai.suggest("Fer", [], []))
    assert error.value.status_code == 503


def test_only_admin_can_use_suggestion():
    client = TestClient(app)
    assert client.post("/api/nutrients/suggest", json={"name": "Fer"}).status_code == 401
    headers = {"Authorization": "Bearer " + create_access_token("client", "client")}
    assert client.post("/api/nutrients/suggest", json={"name": "Fer"}, headers=headers).status_code == 403


def test_fibre_name_and_sourced_values_are_autofilled(monkeypatch):
    url = 'https://example.org/nutrition/banana'
    mock_claude(monkeypatch, {'name': 'Fibres alimentaires', 'type': 'Fibre', 'foods': ['Banane'], 'existing_id': None,
        'explanation': 'Valeur extraite pour une banane crue.', 'quantities': [{'food': 'Banane', 'value': 2.6,
        'unit': 'g', 'basis': '100 g', 'preparation': 'Banane crue', 'source': url}]}, urls=[url])
    data = asyncio.run(nutrient_ai.suggest('Fibres', [{'id': 'Banane'}], []))
    assert data['name'] == 'Fibres' and data['type'] == 'Fibre'
    assert data['amounts'] == {'Banane': [2.6]}
    assert data['sources']['Banane']['source'] == url
    assert data['quantity_source'] == 'web'


def test_invented_source_is_not_used(monkeypatch):
    mock_claude(monkeypatch, {'name': 'Fibres', 'type': 'Fibre', 'foods': ['Banane'], 'existing_id': None,
        'explanation': 'Test', 'quantities': [{'food': 'Banane', 'value': 2.6,
        'unit': 'g', 'basis': '100 g', 'preparation': 'Banane crue', 'source': 'https://invented.invalid'}]})
    data = asyncio.run(nutrient_ai.suggest('Fibres', [{'id': 'Banane'}], []))
    assert data['amounts'] == {} and data['sources'] == {}


def test_admin_category_is_respected_or_mismatch_explained(monkeypatch):
    mock_claude(monkeypatch, {'name': 'Fer', 'type': 'Mineral', 'foods': [], 'existing_id': None, 'explanation': 'Le fer est un minéral.'})
    data = asyncio.run(nutrient_ai.suggest('Fer', [], [], 'Mineral'))
    assert data['name'] == 'Fer' and data['type'] == 'Mineral'
    with pytest.raises(HTTPException) as error:
        asyncio.run(nutrient_ai.suggest('Fer', [], [], 'Vitamine'))
    assert error.value.status_code == 422


def test_cache_avoids_repeat_calls_and_changes_with_database(monkeypatch):
    calls = []
    async def fake(name, foods, catalogue, category, category_label=None):
        calls.append(name)
        return {'name': name, 'foods': [], 'amounts': {}, 'sources': {}}
    monkeypatch.setattr(nutrient_ai, '_suggest', fake)
    first = asyncio.run(nutrient_ai.suggest('Fer', [], [], 'Mineral'))
    second = asyncio.run(nutrient_ai.suggest('Fer', [], [], 'Mineral'))
    assert first['cached'] is False and second['cached'] is True
    assert calls == ['Fer']
    asyncio.run(nutrient_ai.suggest('Fer', [{'id': 'Banane'}], [], 'Mineral'))
    assert calls == ['Fer', 'Fer']


def test_database_fast_path_does_not_call_claude(monkeypatch):
    async def unexpected(*args):
        raise AssertionError('No API call expected')
    monkeypatch.setattr(nutrient_ai, '_suggest', unexpected)
    data = asyncio.run(nutrient_ai.suggest('Protéine', [{'id':'Banane'}], [{'id':'Proteine1','name':'Protéines','type':'Proteine','foods':[{'id':'Banane','values':[1.1]}]}], 'Proteine'))
    assert data['model'] == 'database' and data['amounts'] == {'Banane':[1.1]}


def test_suggestion_returns_complete_result_without_manual_retrieval(monkeypatch):
    from backend.routers import nutrients
    async def slow(body):
        await asyncio.sleep(0.03)
        return {'name': body.name, 'type': body.category, 'foods': ['Banane'], 'amounts': {'Banane': [1]}}
    monkeypatch.setattr(nutrients, 'build_suggestion', slow)
    client = TestClient(app)
    headers = {'Authorization': 'Bearer ' + create_access_token('admin-test', 'admin')}
    response = client.post('/api/nutrients/suggest', json={'name': 'Fer', 'category': 'Mineral'}, headers=headers)
    assert response.status_code == 200
    assert response.json()['amounts'] == {'Banane': [1]}
    assert 'status' not in response.json()


def test_truncated_search_is_recovered_with_structured_extraction(monkeypatch):
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'test-not-real')
    url = 'https://tools.myfooddata.com/test'
    proposal = {'name': 'VitamineC', 'type': 'Vitamine', 'foods': ['Pain blanc'], 'existing_id': None,
                'explanation': 'Proposition extraite.', 'quantities': [{'food': 'Pain blanc', 'value': 1,
                'unit': 'mg', 'basis': 'pour 100g', 'preparation': 'Pain blanc', 'source': url}]}
    responses = iter([
        {'stop_reason': 'max_tokens', 'content': [{'type': 'web_search_tool_result', 'content': [{'type':'web_search_result', 'url':url}]}, {'type':'text', 'text':'{"name":"VitamineC",'}]},
        {'stop_reason': 'tool_use', 'content': [{'type':'tool_use', 'name':'prepare_nutrient', 'input':proposal}]},
    ])
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, *args, **kwargs): return httpx.Response(200, json=next(responses))
    monkeypatch.setattr(nutrient_ai.httpx, 'AsyncClient', Client)
    result = asyncio.run(nutrient_ai.suggest('VitamineC', [{'id':'PainBlanc','name':'Pain blanc'}], [], 'Vitamine'))
    assert result['foods'] == ['PainBlanc']
    assert result['amounts'] == {'PainBlanc':[1]}
    assert result['sources']['PainBlanc']['basis'] == '100 g'
