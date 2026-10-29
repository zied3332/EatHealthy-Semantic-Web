"""All SPARQL queries for meals (Repas): a type, its foods (eh:contientAliment) and the nutrient totals."""

from backend.queries.aliments import ALL_CATEGORIES, PREFIXES, literal, many

MEAL_TYPES = ["PetitDejeuner", "Dejeuner", "Diner", "Collation"]   # subclasses of eh:Repas
ALL_TYPES = " ".join("eh:" + t for t in MEAL_TYPES)
# Nutrient property of a food (per 100 g) -> JSON key.
NUTRIENTS = {"aCalories": "calories", "aGlucides": "glucides", "aProteines": "proteines", "aLipides": "lipides",
             "aFibres": "fibres", "aSucre": "sucre", "aSodium": "sodium"}


def food_nutrients(prefix: str = "") -> str:
    """Sub-query: one row per food, ONE value per nutrient (MAX, because some foods have the value twice)."""
    values = " ".join(f"(MAX(?{key}0) AS ?{prefix}{key})" for key in NUTRIENTS.values())
    optional = " ".join(f"OPTIONAL {{ ?aliment eh:{p} ?{key}0 }}" for p, key in NUTRIENTS.items())
    return (f"SELECT ?aliment {values} WHERE {{ VALUES ?categorie {{ {ALL_CATEGORIES} }} "
            f"?aliment a ?categorie . {optional} }} GROUP BY ?aliment")


def list_food_nutrients() -> str:
    """Every food with its label and nutrients, for the meal form."""
    return PREFIXES + f"""
SELECT ?aliment ?label {" ".join("?" + k for k in NUTRIENTS.values())} WHERE {{
  {{ {food_nutrients()} }}
  OPTIONAL {{ ?aliment rdfs:label ?label }}
}} ORDER BY ?aliment"""


def list_meals() -> str:
    """Every meal with its type, name, owner and the SUM of its foods' nutrients (unknown values count as 0)."""
    sums = " ".join(f"(SUM(COALESCE(?f_{k}, 0)) AS ?{k})" for k in NUTRIENTS.values())
    return PREFIXES + f"""
SELECT ?repas ?type ?nom ?owner ?aliments {" ".join("?" + k for k in NUTRIENTS.values())} WHERE {{
  {{ SELECT ?repas (COUNT(?aliment) AS ?aliments) {sums} WHERE {{
      VALUES ?t {{ {ALL_TYPES} }} ?repas a ?t .
      OPTIONAL {{ ?repas eh:contientAliment ?aliment . {{ {food_nutrients("f_")} }} }}
    }} GROUP BY ?repas }}
  VALUES ?type {{ {ALL_TYPES} }} ?repas a ?type .
  OPTIONAL {{ ?repas rdfs:label ?nom }}
  OPTIONAL {{ ?owner eh:consommeRepas ?repas }}
}} ORDER BY ?type ?repas"""


def meal_foods() -> str:
    """Pairs (meal, food) with the food label."""
    return PREFIXES + f"""
SELECT ?repas ?aliment ?label WHERE {{
  VALUES ?type {{ {ALL_TYPES} }} ?repas a ?type ; eh:contientAliment ?aliment .
  OPTIONAL {{ ?aliment rdfs:label ?label }}
}} ORDER BY ?repas ?label"""


def meal_names() -> str:
    """Meal IDs and names, for the NLP vocabulary."""
    return PREFIXES + f"SELECT ?repas ?nom WHERE {{ VALUES ?type {{ {ALL_TYPES} }} ?repas a ?type . " \
                      "OPTIONAL { ?repas rdfs:label ?nom } }"


def meal_owner(meal_id: str) -> str:
    """One row if the ID is a meal, with its owner (a Personne) if any."""
    return PREFIXES + f"SELECT ?owner WHERE {{ VALUES ?t {{ {ALL_TYPES} }} eh:{meal_id} a ?t . " \
                      f"OPTIONAL {{ ?owner eh:consommeRepas eh:{meal_id} }} }} LIMIT 1"


def account_person(account_id: str) -> str:
    """The Personne of a user account."""
    return PREFIXES + f"SELECT ?person WHERE {{ eh:{account_id} eh:accountPerson ?person }} LIMIT 1"


def known_foods(food_ids: list[str]) -> str:
    """The IDs of this list that are real foods."""
    return PREFIXES + f"SELECT DISTINCT ?aliment WHERE {{ VALUES ?aliment {{ {' '.join('eh:' + f for f in food_ids)} }} " \
                      f"VALUES ?c {{ {ALL_CATEGORIES} }} ?aliment a ?c }}"


# ---------------------------------------------------------------- write
def food_triples(meal_id: str, food_ids: list[str]) -> str:
    return " ".join(f"eh:{meal_id} eh:contientAliment eh:{f} ." for f in food_ids)


def insert_meal(meal_id: str, meal_type: str, name: str, food_ids: list[str], person: str | None) -> str:
    """New meal individual, its foods, and "the person eats this meal" (eh:consommeRepas)."""
    owner = f"eh:{person} eh:consommeRepas eh:{meal_id} ." if person else ""
    return PREFIXES + f"""INSERT DATA {{
  eh:{meal_id} a eh:{meal_type}, owl:NamedIndividual ; rdfs:label {literal(name)}@fr .
  {food_triples(meal_id, food_ids)}
  {owner}
}}"""


def update_meal(meal_id: str, meal_type: str | None, name: str | None, food_ids: list[str] | None) -> str:
    """Replace the type, the name and/or the foods."""
    ops = []
    if meal_type:
        ops += [f"DELETE {{ eh:{meal_id} a ?t }} WHERE {{ VALUES ?t {{ {ALL_TYPES} }} eh:{meal_id} a ?t }}",
                f"INSERT DATA {{ eh:{meal_id} a eh:{meal_type} }}"]
    if name:
        ops += [f"DELETE WHERE {{ eh:{meal_id} rdfs:label ?l }}", f"INSERT DATA {{ eh:{meal_id} rdfs:label {literal(name)}@fr }}"]
    if food_ids is not None:
        ops += [f"DELETE WHERE {{ eh:{meal_id} eh:contientAliment ?a }}", f"INSERT DATA {{ {food_triples(meal_id, food_ids)} }}"]
    return many(ops)


def delete_meal(meal_id: str) -> str:
    """Delete the meal and the links to it. The foods are not touched."""
    return many([f"DELETE WHERE {{ eh:{meal_id} ?p ?o }}", f"DELETE WHERE {{ ?s ?p eh:{meal_id} }}"])
