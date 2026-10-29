"""Nutrient catalogue and food associations, using the existing OWL vocabulary."""
import json

from backend.queries.aliments import PREFIXES, many, delete_all, dec, other_spelling

TYPES = ("Proteine", "Glucide", "Lipide", "Vitamine", "Mineral", "Fibre")
TYPE_VALUES = " ".join(f"eh:{t}" for t in TYPES)

# Same asserted properties as the FoodDetails page. No guessed units or serving sizes.
NUTRITION_FIELDS = {
    "aCalories": "Calories", "aProteines": "Protéines", "aGlucides": "Glucides",
    "aLipides": "Lipides", "aFibres": "Fibres", "aSucre": "Sucres", "aSodium": "Sodium",
}
TYPE_LABELS = {"Proteine": "Protéines", "Glucide": "Glucides", "Lipide": "Lipides", "Vitamine": "Vitamine", "Mineral": "Minéral"}
STANDARD_NUTRIENTS = {
    "aProteines": ("Proteine1", "Protéines", "Proteine"),
    "aGlucides": ("Glucide1", "Glucides", "Glucide"),
    "aLipides": ("NutritionLipides", "Lipides", "Lipide"),
    "aFibres": ("NutritionFibres", "Fibres", "Fibre"),
    "aSucre": ("NutritionSucres", "Sucres", "Glucide"),
    "aSodium": ("NutritionSodium", "Sodium", "Mineral"),
}


def all_nutrition():
    return PREFIXES + f"""SELECT DISTINCT ?food ?foodLabel ?property ?value ?owner ?ownerLabel ?ownerType WHERE {{
      {{ VALUES ?property {{ {' '.join('eh:' + p for p in STANDARD_NUTRIENTS)} }} }}
      UNION {{ ?owner eh:proprieteNutritionnelle ?property ; a ?ownerType . OPTIONAL {{ ?owner rdfs:label ?ownerLabel }} }}
      ?food ?property ?value .
      OPTIONAL {{ ?food rdfs:label ?foodLabel }}
    }} ORDER BY ?food ?property ?value"""


def quantity_update(identifier, prop, foods, amounts, creating=False):
    operations = [f"DELETE {{ ?f eh:{prop} ?v . ?f eh:{prop} ?v2 }} WHERE {{ ?f eh:{prop} ?v . {other_spelling('v')} }}"]
    triples = [f"eh:{identifier} eh:proprieteNutritionnelle eh:{prop} ."]
    triples += [f"eh:{food} eh:{prop} {dec(number)} ." for food in foods for number in amounts.get(food, [])]
    operations.append("INSERT DATA { " + " ".join(triples) + " }")
    return many(operations)


def delete_quantities(prop):
    return many([f"DELETE {{ ?f eh:{prop} ?v . ?f eh:{prop} ?v2 }} WHERE {{ ?f eh:{prop} ?v . {other_spelling('v')} }}"])


def food_nutrition(food):
    return PREFIXES + f"""SELECT DISTINCT ?property ?value WHERE {{
      VALUES ?property {{ {' '.join('eh:' + p for p in NUTRITION_FIELDS)} }}
      eh:{food} ?property ?value .
    }} ORDER BY ?property ?value"""


def list_categories():
    return PREFIXES + """SELECT DISTINCT ?category ?label WHERE {
      ?category rdfs:subClassOf+ eh:Nutriment . FILTER(isIRI(?category))
      OPTIONAL { ?category rdfs:label ?label FILTER(LANG(?label) IN ("", "fr")) }
    } ORDER BY ?category"""


def rename_category(identifier, name):
    return many([f"DELETE WHERE {{ eh:{identifier} rdfs:label ?old }}",
                 f"INSERT DATA {{ eh:{identifier} rdfs:label {json.dumps(name, ensure_ascii=False)}@fr }}"])


def list_nutrients(nutrient_id=None, food=None):
    one = f"VALUES ?nutrient {{ eh:{nutrient_id} }}" if nutrient_id else ""
    food_filter = (f"FILTER EXISTS {{ {{ eh:{food} eh:contientNutriment ?nutrient }} UNION "
                   f"{{ ?nutrient eh:estNutrimentDe eh:{food} }} }}") if food else ""
    return PREFIXES + f"""
SELECT DISTINCT ?nutrient ?type ?label ?food ?foodLabel ?sourceData WHERE {{
  {one}
  ?nutrient a ?type . ?type rdfs:subClassOf* eh:Nutriment .
  FILTER(isIRI(?nutrient))
  OPTIONAL {{ ?nutrient eh:sourcesNutritionnelles ?sourceData }}
  OPTIONAL {{ ?nutrient rdfs:label ?label FILTER(LANG(?label) IN ("", "fr")) }}
  OPTIONAL {{ {{ ?food eh:contientNutriment ?nutrient }} UNION {{ ?nutrient eh:estNutrimentDe ?food }}
              OPTIONAL {{ ?food rdfs:label ?foodLabel }} }}
  {food_filter}
}} ORDER BY ?nutrient ?food
"""


def save_nutrient(nutrient_id, name, nutrient_type, foods, creating=False):
    operations = []
    if not creating:
        operations += [
            f"DELETE {{ eh:{nutrient_id} a ?t }} WHERE {{ eh:{nutrient_id} a ?t . ?t rdfs:subClassOf* eh:Nutriment }}",
            f"DELETE WHERE {{ eh:{nutrient_id} rdfs:label ?label }}",
            f"DELETE WHERE {{ ?food eh:contientNutriment eh:{nutrient_id} }}",
            f"DELETE WHERE {{ eh:{nutrient_id} eh:estNutrimentDe ?food }}",
        ]
    triples = f"eh:{nutrient_id} a eh:{nutrient_type} ; rdfs:label {json.dumps(name, ensure_ascii=False)}@fr ."
    triples += " ".join(f"eh:{food} eh:contientNutriment eh:{nutrient_id} ." for food in foods)
    if nutrient_type == "Fibre":
        triples += " eh:Fibre a owl:Class ; rdfs:subClassOf eh:Glucide ."
    return many([*operations, f"INSERT DATA {{ {triples} }}"])


def save_sources(identifier, sources):
    return many([f"DELETE WHERE {{ eh:{identifier} eh:sourcesNutritionnelles ?old }}",
                 f"INSERT DATA {{ eh:{identifier} eh:sourcesNutritionnelles {json.dumps(json.dumps(sources, ensure_ascii=False), ensure_ascii=False)} }}"])


def delete_nutrient(nutrient_id):
    return many(delete_all(f"eh:{nutrient_id}"))
