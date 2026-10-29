# Module "Repas" (meals)

A user makes a meal: breakfast, lunch, dinner or snack, chooses the foods, and sees the totals
of calories, carbs, proteins, fats, fibres, sugar and sodium (per 100 g of each food).

## Ontology (no new schema)

- `eh:PetitDejeuner`, `eh:Dejeuner`, `eh:Diner`, `eh:Collation` (subclasses of `eh:Repas`), name in `rdfs:label`.
- `eh:contientAliment` links the meal to its foods.
- `?person eh:consommeRepas ?meal`: who made the meal (from the account's `eh:accountPerson`).
- Totals: SPARQL `SUM` over the foods' `aCalories`, `aGlucides`, `aProteines`, `aLipides`, `aFibres`, `aSucre`,
  `aSodium` (one value per food; an unknown value counts as 0).

## Files

| File | Job |
| --- | --- |
| `backend/queries/meals.py` | all SPARQL for meals |
| `backend/routers/meals.py` | API |
| `backend/tests/test_meals.py` | tests |
| `frontend/src/services/meals.ts` | types, API calls, `sumNutrients()` |
| `frontend/src/pages/Meals/` | Meals page |

## API (logged in)

| Method | URL | Who |
| --- | --- | --- |
| GET | `/api/meals`, `/api/meals/foods` | every user |
| POST | `/api/meals` `{name, type, foods}` | every user (the meal is theirs) |
| PUT / DELETE | `/api/meals/{id}` | the owner, or an admin |

## Questions (NLP module, no LLM)

The question box understands meals (intents `meal_total` and `meal_foods`):
"Combien de glucides dans le déjeuner ?", "Quels aliments contient le dîner ?",
"Quel repas est le plus calorique ?", and a meal by its name ("Que contient mon ftour ?").
