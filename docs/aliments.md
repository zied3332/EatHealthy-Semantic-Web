# Module "Gestion des aliments" (food management)

Author: Mahdi. EatHealthy, Semantic Web course (ESPRIT, 5TWIN).

## What it does

- **Aliment CRUD** (categories Fruit, Legume, Cereale, Viande, Poisson, ProduitLaitier). Admin only for writes.
- **ImpactEnvironnemental CRUD**: carbon footprint (`EmpreinteCarbone`, kg CO2e/kg) and water footprint
  (`EmpreinteEau`, L/kg), on the **Environmental Impact** page.
- **AI question box**: question → Groq writes SPARQL → the query is checked → Fuseki runs it → answer.
  The answer is built only from the query results, never from the AI's memory.
- **HermiT check**: 3 defined OWL classes are inferred: `AlimentFaibleCarbone`, `AlimentFortCarbone`, `AlimentDurable`.

## Files (one job each)

| File | Job |
| --- | --- |
| `ontology/aliments-module.ttl` | new properties, disjoint axioms and the 3 defined classes (also in `eathealthy.rdf`) |
| `backend/queries/aliments.py` | all SPARQL for foods and impacts |
| `backend/routers/foods.py` | food CRUD + AI question endpoints |
| `backend/routers/impacts.py` | impact CRUD + ranking |
| `backend/services/nl2sparql.py` | AI: prompt, Groq call, safety check, run, answer |
| `backend/scripts/setup_aliments.py` | one-time demo data (safe to run twice) |
| `backend/scripts/check_aliments.py` | HermiT check with Owlready2 |
| `backend/tests/test_aliments.py` | the important tests |
| `frontend/src/services/aliments.ts` | types, API calls, `co2Level()` |
| `frontend/src/pages/Foods/` | Food Explorer + `FoodForm`, `AskFoods`, `aliments.css` |
| `frontend/src/pages/Impacts/Impacts.tsx` | impact CRUD page |

## Ontology

```
AlimentFaibleCarbone ≡ Aliment ⊓ ∃aImpact.(EmpreinteCarbone ⊓ ∃valeurImpact.xsd:decimal[≤ 2.0])
AlimentFortCarbone   ≡ Aliment ⊓ ∃aImpact.(EmpreinteCarbone ⊓ ∃valeurImpact.xsd:decimal[≥ 10.0])
AlimentDurable       ≡ AlimentFaibleCarbone ⊓ ∃estLocal.{true}
```

Also: `valeurImpact` (functional), `uniteImpact`, `sourceImpact`, `estImpactDe` (inverse of `aImpact`),
the 6 categories are disjoint, `aCalories` and `prixMoyen` are functional.
A food's name is `rdfs:label "..."@fr`; numbers are typed (`"282"^^xsd:decimal`).

## API

| Method | URL | Who |
| --- | --- | --- |
| GET | `/api/foods`, `/api/foods/{id}` | everyone (old keys kept, plus label, values, co2, water, co2_level, sustainable) |
| POST / PUT / DELETE | `/api/foods`, `/api/foods/{id}` | admin |
| GET | `/api/impacts?type=EmpreinteCarbone` or `EmpreinteEau` | everyone |
| POST / PUT / DELETE | `/api/impacts`, `/api/impacts/{id}` | admin |
| GET | `/api/foods/ask/examples` | everyone |
| POST | `/api/foods/ask` `{question}` | logged in |

## AI safety

The query must be exactly one SELECT or ASK, with no INSERT, DELETE, LOAD, CLEAR, DROP, CREATE or SERVICE.
It must parse with rdflib, and it gets `LIMIT 50`. It runs on Fuseki's read-only query endpoint.
If it fails, Groq gets one retry with the error. If Groq is busy, the 9 demo questions use their saved SPARQL.

## Run and test

```powershell
python -m backend.scripts.setup_aliments    # once, and again after Fuseki is reloaded
python -m pytest backend/tests -q
python -m backend.scripts.check_aliments    # needs Java; Protégé: open ontology/demo/eathealthy-demo.owl
```

`backend/.env` (never committed) holds `GROQ_API_KEY` and `GROQ_MODEL`; copy it from `backend/.env.example`.

Fuseki note: TDB2 returns a stored `"120"^^xsd:decimal` as `"120.0"`, and deleting `"120.0"` does not remove
`"120"`. Every delete also targets the other spelling (`other_spelling()` in `queries/aliments.py`).

Data: Our World in Data, Poore & Nemecek (2018), world averages per kg of food.
