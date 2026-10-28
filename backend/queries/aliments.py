"""All SPARQL queries for foods (Aliment) and impacts (ImpactEnvironnemental), plus small helpers."""

import re
import unicodedata
from decimal import Decimal

EH = "http://www.semanticweb.org/thinkpad/ontologies/2026/9/EatHealthy#"
XSD = "http://www.w3.org/2001/XMLSchema#"

PREFIXES = f"""
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX xsd: <{XSD}>
PREFIX eh: <{EH}>
"""

CATEGORIES = ["Fruit", "Legume", "Cereale", "Viande", "Poisson", "ProduitLaitier"]   # subclasses of eh:Aliment
# Impact class -> (ID prefix, unit).
IMPACTS = {"EmpreinteCarbone": ("CO2_", "kg CO2e/kg"), "EmpreinteEau": ("Eau_", "L/kg")}

LOW_CARBON_MAX = 2.0    # same thresholds as the OWL classes in aliments-module.ttl
HIGH_CARBON_MIN = 10.0
DEFAULT_SOURCE = "Our World in Data, Poore & Nemecek (2018)"

ALL_CATEGORIES = " ".join(f"eh:{c}" for c in CATEGORIES)


# ---------------------------------------------------------------- helpers
def literal(text) -> str:
    """A safe SPARQL string literal."""
    return '"' + str(text).replace("\\", "\\\\").replace('"', '\\"') + '"'


def dec(number) -> str:
    """A typed decimal: 660.0 -> "660"^^xsd:decimal."""
    value = Decimal(str(number))
    if not value.is_finite():
        raise ValueError("Not a finite number")
    value = value.quantize(Decimal(1)) if value == value.to_integral_value() else value.normalize()
    return f'"{value:f}"^^xsd:decimal'


def make_id(label: str) -> str:
    """"Datte Deglet Nour" -> DatteDegletNour, "Bœuf" -> Boeuf."""
    for old, new in (("œ", "oe"), ("Œ", "Oe"), ("æ", "ae"), ("Æ", "Ae"), ("ß", "ss")):
        label = label.replace(old, new)
    text = "".join(c for c in unicodedata.normalize("NFKD", label) if not unicodedata.combining(c))
    result = "".join(w[0].upper() + w[1:] for w in re.findall(r"[A-Za-z0-9]+", text))
    if not result:
        raise ValueError("The name must contain letters or digits.")
    return "Aliment" + result if result[0].isdigit() else result


def valid_id(value: str) -> bool:
    """Only safe local names may go into a query."""
    return bool(re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", value or ""))


def co2_level(value: float | None) -> str | None:
    """Same rule as AlimentFaibleCarbone / AlimentFortCarbone."""
    if value is None:
        return None
    return "low" if value <= LOW_CARBON_MAX else "high" if value >= HIGH_CARBON_MIN else "medium"


def value(binding: dict | None):
    """SPARQL JSON value -> Python: local name, number, bool or text."""
    if not binding:
        return None
    text, datatype = binding["value"], binding.get("datatype", "")
    if binding["type"] == "uri":   # keep only the local name: ...#Pomme -> Pomme
        return text.rsplit("#", 1)[-1]
    if datatype == XSD + "boolean":
        return text == "true"
    if datatype.startswith(XSD) and datatype[len(XSD):] in ("decimal", "integer", "double", "float", "int", "long"):
        return int(text) if re.fullmatch(r"-?\d+", text) else float(text)
    return text


# Fuseki (TDB2) returns a stored "120"^^xsd:decimal as "120.0", and deleting "120.0"
# does not remove "120". So every delete also targets the other spelling (?old2).
def other_spelling(var: str) -> str:
    return (f'BIND(IF(DATATYPE(?{var}) = xsd:decimal, '
            f'STRDT(REPLACE(STR(?{var}), "\\\\.0$", ""), xsd:decimal), ?none) AS ?{var}2)')


# ---------------------------------------------------------------- read
def list_foods(food_id: str | None = None) -> str:
    """Foods with category, label, nutrition values and both footprints."""
    one = f"VALUES ?food {{ eh:{food_id} }}" if food_id else ""
    return PREFIXES + f"""
SELECT ?food ?category ?label ?calories ?price ?organic ?local ?co2 ?water WHERE {{
  {one}
  VALUES ?category {{ {ALL_CATEGORIES} }}
  ?food a ?category .
  OPTIONAL {{ ?food rdfs:label ?label }}
  OPTIONAL {{ ?food eh:aCalories ?calories }} OPTIONAL {{ ?food eh:prixMoyen ?price }}
  OPTIONAL {{ ?food eh:estBio ?organic }} OPTIONAL {{ ?food eh:estLocal ?local }}
  OPTIONAL {{ ?food eh:aImpact ?c . ?c a eh:EmpreinteCarbone ; eh:valeurImpact ?co2 }}
  OPTIONAL {{ ?food eh:aImpact ?w . ?w a eh:EmpreinteEau ; eh:valeurImpact ?water }}
}} ORDER BY ?food"""


def is_food(food_id: str) -> str:
    """One row if the ID is a food of one of the 6 categories."""
    return PREFIXES + f"SELECT ?c WHERE {{ VALUES ?c {{ {ALL_CATEGORIES} }} eh:{food_id} a ?c }} LIMIT 1"


def id_used(resource_id: str) -> str:
    """One row if the ID already appears in the dataset."""
    return PREFIXES + f"SELECT ?p WHERE {{ {{ eh:{resource_id} ?p ?o }} UNION {{ ?s ?p eh:{resource_id} }} }} LIMIT 1"


def list_impacts(impact_type: str) -> str:
    """All impacts of one type with their food, highest value first."""
    return PREFIXES + f"""
SELECT ?impact ?food ?label ?value ?unit ?source WHERE {{
  ?impact a eh:{impact_type} . ?food eh:aImpact ?impact .
  OPTIONAL {{ ?food rdfs:label ?label }} OPTIONAL {{ ?impact eh:valeurImpact ?value }}
  OPTIONAL {{ ?impact eh:uniteImpact ?unit }} OPTIONAL {{ ?impact eh:sourceImpact ?source }}
}} ORDER BY DESC(?value)"""


def is_impact(resource_id: str) -> str:
    """One row if the ID is a carbon or water impact."""
    return PREFIXES + f"SELECT ?t WHERE {{ VALUES ?t {{ eh:EmpreinteCarbone eh:EmpreinteEau }} eh:{resource_id} a ?t }} LIMIT 1"


# ---------------------------------------------------------------- write
FIELDS = {"label": "rdfs:label", "calories": "eh:aCalories", "price": "eh:prixMoyen", "organic": "eh:estBio", "local": "eh:estLocal"}


def many(operations: list[str]) -> str:
    """Join several update operations; each gets the prefixes (rdflib forgets them otherwise)."""
    return " ;\n".join(PREFIXES + op for op in operations)


def rdf_value(field: str, data) -> str:
    """Python value -> typed SPARQL literal for one food field."""
    if field in ("organic", "local"):
        return "true" if data else "false"
    return literal(data) + "@fr" if field == "label" else dec(data)


def insert_food(food_id: str, category: str, fields: dict) -> str:
    """Create a food: its category, French label and typed values."""
    triples = "".join(f" ; {FIELDS[k]} {rdf_value(k, v)}" for k, v in fields.items() if v is not None)
    return PREFIXES + f"INSERT DATA {{ eh:{food_id} a eh:{category}{triples} . }}"


def replace_value(subject: str, prop: str, new: str) -> str:
    """Replace the old value(s) of one property, even when there is none."""
    return (f"DELETE {{ eh:{subject} {prop} ?old . eh:{subject} {prop} ?old2 }} "
            f"INSERT {{ eh:{subject} {prop} {new} }} "
            f"WHERE {{ OPTIONAL {{ eh:{subject} {prop} ?old . {other_spelling('old')} }} }}")


def update_food(food_id: str, changes: dict) -> str:
    """One block per changed field; a category change replaces only the category."""
    blocks = [replace_value(food_id, FIELDS[k], rdf_value(k, v)) for k, v in changes.items() if k in FIELDS]
    if "category" in changes:
        blocks.append(f"DELETE {{ eh:{food_id} a ?old }} INSERT {{ eh:{food_id} a eh:{changes['category']} }} "
                      f"WHERE {{ eh:{food_id} a ?old VALUES ?old {{ {ALL_CATEGORIES} }} }}")
    return many(blocks)


def delete_all(subject: str) -> list[str]:
    """Delete every triple of a subject and every triple pointing to it."""
    return [f"DELETE {{ {subject} ?p ?o . {subject} ?p ?o2 }} WHERE {{ {subject} ?p ?o . {other_spelling('o')} }}",
            f"DELETE WHERE {{ ?s ?p {subject} }}"]


def delete_food(food_id: str) -> str:
    """Delete the food's impacts, then the food and all links to it (meals, diets...)."""
    impacts = (f"DELETE {{ ?i ?p ?o . ?i ?p ?o2 }} WHERE {{ eh:{food_id} eh:aImpact ?i . ?i ?p ?o . "
               f"{other_spelling('o')} }}")
    return many([impacts, *delete_all(f"eh:{food_id}")])


def insert_impact(food_id: str, impact_type: str, number: float, source: str) -> str:
    """Create CO2_<food> or Eau_<food> and link it to the food with eh:aImpact."""
    prefix, unit = IMPACTS[impact_type]
    return PREFIXES + f"""INSERT DATA {{
  eh:{prefix}{food_id} a eh:{impact_type} ; eh:valeurImpact {dec(number)} ;
      eh:uniteImpact {literal(unit)} ; eh:sourceImpact {literal(source)} .
  eh:{food_id} eh:aImpact eh:{prefix}{food_id} .
}}"""


def update_impact(impact_id: str, number: float | None, source: str | None) -> str:
    """Replace the value and/or the source of an impact."""
    new_number = [replace_value(impact_id, "eh:valeurImpact", dec(number))] if number is not None else []
    new_source = [replace_value(impact_id, "eh:sourceImpact", literal(source))] if source else []
    return many(new_number + new_source)


def delete_impact(impact_id: str) -> str:
    """Delete an impact and the link from its food."""
    return many(delete_all(f"eh:{impact_id}"))
