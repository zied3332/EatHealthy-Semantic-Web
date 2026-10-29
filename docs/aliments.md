# Module "Gestion des aliments" (food management)

Author: Mahdi. EatHealthy, Semantic Web course (ESPRIT, 5TWIN).

## What it does

- **Aliment CRUD** (categories Fruit, Legume, Cereale, Viande, Poisson, ProduitLaitier). Admin only for writes.
- **ImpactEnvironnemental CRUD**: carbon footprint (`EmpreinteCarbone`, kg CO2e/kg) and water footprint
  (`EmpreinteEau`, L/kg), on the **Environmental Impact** page.
- **NLP question box (no LLM)**: question → spaCy + scikit-learn find the intent and the entities →
  a SPARQL template is filled → the query is checked → Fuseki runs it → answer built only from the results.
- **HermiT check**: 3 defined OWL classes are inferred: `AlimentFaibleCarbone`, `AlimentFortCarbone`, `AlimentDurable`.

## Files (one job each)

| File | Job |
| --- | --- |
| `ontology/aliments-module.ttl` | new properties, disjoint axioms and the 3 defined classes (also in `eathealthy.rdf`) |
| `backend/queries/aliments.py` | all SPARQL for foods and impacts |
| `backend/routers/foods.py` | food CRUD + question box endpoints |
| `backend/routers/impacts.py` | impact CRUD + ranking |
| `backend/services/nlp_aliments.py` | NLP: spaCy, PhraseMatcher, difflib, intent classifier, slots |
| `backend/nlp_data/intents_aliments.json` | training phrases of the 9 intents |
| `backend/services/nl2sparql.py` | SPARQL templates, safety check, run, answer |
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

## NLP/TALN module (no LLM)

Everything runs on the computer, with no internet. Tools:

- **spaCy** (`fr_core_news_sm`): tokens, lemmas, POS, and a **PhraseMatcher** for the entities.
- **difflib**: typo correction (`get_close_matches`, cutoff 0.8): "pome" → Pomme, "carbonne" → carbone.
- **scikit-learn**: intent classifier, `TfidfVectorizer` (words 1–2 + characters 2–5) + `LogisticRegression`.
- **rdflib**: checks the generated SPARQL.

Steps for one question (`nlp_aliments.py`, then `nl2sparql.py`):

1. spaCy analysis; each token gets a normalized lemma (lowercase, no accents).
2. Entities: FOOD (labels read from Fuseki), CATEGORY, IMPACT, ATTRIBUTE, DIET, LEVEL; difflib for typos.
3. Delexicalization: `Quels fruits locaux…` → `quel ent_cat ent_attr avoir un ent_level empreindre ent_impact`.
   The classifier learns the shape of the question, so a food created with the CRUD is understood without retraining.
4. Intent (TF-IDF + logistic regression), trained at startup on `intents_aliments.json` (placeholders filled 3 times).
   Accuracy: **91.6 %** (grouped 5-fold cross-validation, 537 phrases).
5. Slots by rules: numbers and comparators ("moins de 100 kcal"), superlatives ("le plus", "le moins", "top 3"),
   negation ("pas bio"), yes/no form ("est-il").
6. The most probable intent whose entities are present (`value` needs a food, `compare` two).
   No entity and a weak intent → out of scope: polite answer, no query.
7. One SPARQL template per intent, with the filters built in one place (`filters()`):
   `list`, `value`, `extreme`, `count`, `average`, `yes_no`, `ranking`, `compare`, `details`.
   Same thresholds as the OWL classes (low ≤ 2, high ≥ 10, sustainable = low and local).

The vocabulary of foods is reloaded from Fuseki after each food create, update or delete (`refresh()`).
The answer JSON has an `nlp` key (tokens, entities, masked text, intent, confidence, top 3, slots, tools),
shown in the **NLP analysis** panel of the question box.

Safety: the query must be exactly one SELECT or ASK, with no INSERT, DELETE, LOAD, CLEAR, DROP, CREATE or SERVICE.
It must parse with rdflib, and it gets `LIMIT 50`. It runs on Fuseki's read-only query endpoint.

## Run and test

```powershell
pip install -r backend/requirements.txt      # also installs spaCy, scikit-learn and fr_core_news_sm
python -m backend.scripts.setup_aliments    # once, and again after Fuseki is reloaded
python -m pytest backend/tests -q -s        # prints the classifier accuracy
python -m backend.scripts.check_aliments    # needs Java; Protégé: open ontology/demo/eathealthy-demo.owl
```

Fuseki note: TDB2 returns a stored `"120"^^xsd:decimal` as `"120.0"`, and deleting `"120.0"` does not remove
`"120"`. Every delete also targets the other spelling (`other_spelling()` in `queries/aliments.py`).

Data: Our World in Data, Poore & Nemecek (2018), world averages per kg of food.
