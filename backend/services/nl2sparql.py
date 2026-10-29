"""Question box with no LLM: the NLP module finds the intent and the entities, a SPARQL template is filled, checked and run on Fuseki."""

import re
import time
from decimal import ROUND_HALF_UP, Decimal

import httpx
from fastapi import HTTPException
from rdflib.plugins.sparql import prepareQuery

from backend.queries.aliments import CATEGORIES, HIGH_CARBON_MIN, LOW_CARBON_MAX, PREFIXES, list_foods, valid_id, value
from backend.queries.meals import MEAL_TYPES, NUTRIENTS, food_nutrients, meal_names
from backend.services.fuseki_service import FUSEKI_ENDPOINT
from backend.services.nlp_aliments import NlpAliments

DEMO = [
    "Quels fruits locaux ont une faible empreinte carbone ?",
    "Quel aliment a la plus grosse empreinte carbone ?",
    "Quel aliment consomme le plus d'eau ?",
    "Quelle est l'empreinte carbone moyenne par catégorie ?",
    "Combien de fruits y a-t-il ?",
    "Quels aliments de moins de 100 kcal ont une faible empreinte carbone ?",
    "Quels aliments végans ont une faible empreinte carbone ?",
    "Le saumon est-il un aliment local ?",
    "Quels aliments sont durables ?",
    "Combien de glucides dans le déjeuner ?",
    "Quels aliments contient le dîner ?",
]
NOT_UNDERSTOOD = ("Je n'ai pas compris cette question. Je réponds aux questions sur les aliments de la base : "
                  "empreinte carbone, eau, calories, prix, bio, local, régimes.")
EXPLAIN = {
    "list": "Je liste les aliments qui respectent tous les filtres trouvés.",
    "value": "Je cherche une valeur d'un aliment.",
    "extreme": "Je trie les aliments et je garde le premier.",
    "count": "Je compte les aliments qui respectent les filtres.",
    "average": "Je calcule la moyenne par catégorie.",
    "yes_no": "Je vérifie si l'aliment respecte la condition (requête ASK).",
    "ranking": "Je classe les aliments.",
    "compare": "Je mets les aliments côte à côte.",
    "details": "Je montre toutes les valeurs de l'aliment.",
    "meal_total": "J'additionne les nutriments des aliments du repas (pour 100 g de chaque aliment).",
    "meal_foods": "Je liste les aliments du repas.",
}
CARBON = "EmpreinteCarbone"
# Measures: ontology ID -> (SPARQL variable, triple patterns that bind it).
MEASURES = {
    "EmpreinteCarbone": ("co2", "?aliment eh:aImpact ?ic . ?ic a eh:EmpreinteCarbone ; eh:valeurImpact ?co2 ."),
    "EmpreinteEau": ("eau", "?aliment eh:aImpact ?ie . ?ie a eh:EmpreinteEau ; eh:valeurImpact ?eau ."),
    "aCalories": ("calories", "?aliment eh:aCalories ?calories ."),
    "prixMoyen": ("prix", "?aliment eh:prixMoyen ?prix ."),
    **{p: (key, f"?aliment eh:{p} ?{key} .") for p, key in NUTRIENTS.items() if p != "aCalories"},
}
LABEL = "OPTIONAL { ?aliment rdfs:label ?nom }"

nlp = NlpAliments()   # trained once, when the backend starts


def demo_questions() -> list[str]:
    return DEMO


# ---------------------------------------------------------------- vocabulary from the ontology

async def refresh() -> None:
    """Reload the food and meal names (rdfs:label and ID) from Fuseki into the PhraseMatcher. No retraining."""
    foods = (await fetch(list_foods()))["results"]["bindings"]
    meals = (await fetch(meal_names()))["results"]["bindings"]
    nlp.set_vocabulary([(value(r.get("label")) or value(r["food"]), value(r["food"])) for r in foods],
                       [(value(r.get("nom")) or value(r["repas"]), value(r["repas"])) for r in meals])


# ---------------------------------------------------------------- entities and slots -> SPARQL

def ids(analysis: dict, kind: str) -> list[str]:
    """Ontology IDs of one entity type, in question order, without duplicates."""
    found = [e["id"] for e in analysis["entities"] if e["type"] == kind]
    return [i for i in dict.fromkeys(found) if valid_id(i)]


def measures(analysis: dict, default=(CARBON,)) -> list[str]:
    """The numeric values asked for (carbon, water, calories, price); the default if none."""
    found = [i for i in ids(analysis, "IMPACT") + ids(analysis, "ATTRIBUTE") if i in MEASURES]
    return found or list(default)


def filters(analysis: dict, extra=()) -> tuple[list[str], list[str]]:
    """Entities and slots -> SPARQL lines and value columns. Shared by every template."""
    categories = " ".join("eh:" + c for c in ids(analysis, "CATEGORY") or CATEGORIES)
    lines, columns = [f"VALUES ?categorie {{ {categories} }} ?aliment a ?categorie ."], []

    def need(measure: str) -> str:
        var, triples = MEASURES[measure]
        if var not in columns:
            columns.append(var)
            lines.append(triples)
        return var

    for measure in extra:
        need(measure)
    slots, levels = analysis["slots"], ids(analysis, "LEVEL")
    for n in slots["numbers"]:
        lines.append(f"FILTER(?{need(n['measure'])} {n['op']} {n['value']:g})")
    if "low" in levels or "sustainable" in levels:   # same thresholds as the OWL classes
        lines.append(f"FILTER(?{need(CARBON)} <= {LOW_CARBON_MAX:g})")
    if "high" in levels:
        lines.append(f"FILTER(?{need(CARBON)} >= {HIGH_CARBON_MIN:g})")
    if "sustainable" in levels:
        lines.append("?aliment eh:estLocal true .")
    for flag in ids(analysis, "ATTRIBUTE"):
        if flag in ("estBio", "estLocal"):
            lines.append(f"?aliment eh:{flag} {'false' if slots['negation'] else 'true'} .")
    for diet in ids(analysis, "DIET"):
        lines.append(f"?aliment eh:compatibleAvecRegime ?r{diet} . ?r{diet} a eh:{diet} .")
    return lines, columns


def body(lines: list[str]) -> str:
    return "\n  ".join(lines)


def columns_of(columns: list[str]) -> str:
    return " ".join("?" + c for c in columns)


# list: the foods that pass every filter, sorted by the first value.
def list_query(a: dict) -> str:
    lines, columns = filters(a)
    order = "?" + columns[0] if columns else "?nom"
    return f"SELECT DISTINCT ?aliment ?nom {columns_of(columns)} WHERE {{\n  {body(lines)}\n  {LABEL}\n}} ORDER BY {order}"


# extreme and ranking: sorted by one value, highest first (lowest with "moins" or "plus petit").
def sorted_query(a: dict, limit: int) -> str:
    measure = measures(a)[0]
    lines, columns = filters(a, [measure])
    order = "ASC" if a["slots"]["order"] == "ASC" else "DESC"
    return (f"SELECT DISTINCT ?aliment ?nom {columns_of(columns)} WHERE {{\n  {body(lines)}\n  {LABEL}\n}} "
            f"ORDER BY {order}(?{MEASURES[measure][0]}) LIMIT {a['slots']['limit'] or limit}")


# count: number of foods that pass the filters.
def count_query(a: dict) -> str:
    lines, _ = filters(a)
    return f"SELECT (COUNT(DISTINCT ?aliment) AS ?nombre) WHERE {{\n  {body(lines)}\n}}"


# average: mean of one value for each category, highest first.
def average_query(a: dict) -> str:
    measure = measures(a)[0]
    lines, _ = filters(a, [measure])
    avg = "moyenne_" + MEASURES[measure][0]
    return (f"SELECT ?categorie (AVG(?{MEASURES[measure][0]}) AS ?{avg}) WHERE {{\n  {body(lines)}\n}} "
            f"GROUP BY ?categorie ORDER BY DESC(?{avg})")


# value: the asked values of one food.
def value_query(a: dict) -> str:
    wanted = measures(a)
    triples = [MEASURES[m][1] for m in wanted]
    return (f"SELECT ?nom {columns_of([MEASURES[m][0] for m in wanted])} WHERE {{\n"
            f"  VALUES ?aliment {{ eh:{ids(a, 'FOOD')[0]} }}\n  {LABEL}\n  {body(triples)}\n}}")


# yes_no: does this food pass the filters (category, bio, local, diet, level)?
def yes_no_query(a: dict) -> str:
    lines, _ = filters(a)
    return f"ASK {{\n  VALUES ?aliment {{ eh:{ids(a, 'FOOD')[0]} }}\n  {body(lines)}\n}}"


# compare: several foods side by side (optional values, so a missing one stays empty).
def compare_query(a: dict) -> str:
    wanted = measures(a, default=(CARBON, "EmpreinteEau", "aCalories"))
    foods = " ".join("eh:" + f for f in ids(a, "FOOD"))
    optional = [f"OPTIONAL {{ {MEASURES[m][1]} }}" for m in wanted]
    return (f"SELECT ?aliment ?nom {columns_of([MEASURES[m][0] for m in wanted])} WHERE {{\n"
            f"  VALUES ?aliment {{ {foods} }}\n  {LABEL}\n  {body(optional)}\n}}")


# details: every value of one food (the query of the food page).
def details_query(a: dict) -> str:
    return list_foods(ids(a, "FOOD")[0])


def meal_filter(a: dict) -> str:
    """The meals named in the question: a type (déjeuner…), every meal ("repas"), or one meal by its name."""
    meals = ids(a, "MEAL")
    types = " ".join("eh:" + t for t in [m for m in meals if m in MEAL_TYPES] or MEAL_TYPES)
    named = " ".join("eh:" + m for m in meals if m not in MEAL_TYPES and m != "Repas")
    return f"VALUES ?type {{ {types} }} ?repas a ?type ." + (f" VALUES ?repas {{ {named} }}" if named else "")


# meal_total: sum of the foods' nutrients for each meal (one value per food), highest first.
def meal_total_query(a: dict) -> str:
    wanted = [NUTRIENTS[m] for m in measures(a) if m in NUTRIENTS] or ["calories", "glucides", "proteines", "lipides"]
    sums = " ".join(f"(SUM(COALESCE(?f_{k}, 0)) AS ?total_{k})" for k in wanted)
    order = "ASC" if a["slots"]["order"] == "ASC" else "DESC"
    limit = a["slots"]["limit"] or (1 if a["slots"]["order"] else 50)
    return (f"SELECT ?repas ?nom {sums} WHERE {{\n  {meal_filter(a)}\n  ?repas eh:contientAliment ?aliment .\n"
            f"  {{ {food_nutrients('f_')} }}\n  OPTIONAL {{ ?repas rdfs:label ?nom }}\n}} "
            f"GROUP BY ?repas ?nom HAVING (COUNT(?aliment) > 0) ORDER BY {order}(?total_{wanted[0]}) LIMIT {limit}")


# meal_foods: the foods of the meals.
def meal_foods_query(a: dict) -> str:
    return (f"SELECT ?repas ?aliment ?nom WHERE {{\n  {meal_filter(a)}\n  ?repas eh:contientAliment ?aliment .\n"
            f"  OPTIONAL {{ ?aliment rdfs:label ?nom }}\n}} ORDER BY ?repas ?nom")


TEMPLATES = {"list": list_query, "extreme": lambda a: sorted_query(a, 1), "ranking": lambda a: sorted_query(a, 50),
             "count": count_query, "average": average_query, "value": value_query, "yes_no": yes_no_query,
             "compare": compare_query, "details": details_query,
             "meal_total": meal_total_query, "meal_foods": meal_foods_query}


# ---------------------------------------------------------------- safety check

FORBIDDEN = re.compile(r"\b(INSERT|DELETE|LOAD|CLEAR|DROP|CREATE|SERVICE)\b", re.IGNORECASE)


def check(sparql: str) -> str:
    """Keep only ONE read query (SELECT or ASK), add LIMIT 50 and our prefixes."""
    query = re.sub(r"(?i)PREFIX\s+[\w-]*:\s*<[^>]*>", "", sparql or "").strip()
    code = re.sub(r'"[^"]*"|\?\w+|<[^>\s]*>', " ", query)   # ignore strings, variables and IRIs
    if FORBIDDEN.search(code):
        raise ValueError("Only read queries (SELECT or ASK) are allowed.")
    try:
        form = prepareQuery(PREFIXES + query).algebra.name
    except Exception as exc:   # rdflib raises pyparsing errors on bad syntax
        raise ValueError(f"Invalid SPARQL: {exc}") from exc
    if form not in ("SelectQuery", "AskQuery"):
        raise ValueError("Only one SELECT or ASK query is allowed.")
    if form == "SelectQuery" and not re.search(r"(?i)\bLIMIT\s+\d+", code):
        query += "\nLIMIT 50"
    return PREFIXES + query


# ---------------------------------------------------------------- run and answer

async def fetch(query: str) -> dict:
    """Run a query on the read-only Fuseki query endpoint."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(FUSEKI_ENDPOINT, data={"query": query},
                                         headers={"Accept": "application/sparql-results+json"})
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Unable to retrieve data from Fuseki") from exc
    if response.status_code >= 400:
        raise ValueError("Fuseki error: " + response.text[:200])
    return response.json()


def number(x) -> str:
    return format(Decimal(str(x)).quantize(Decimal("0.01"), ROUND_HALF_UP).normalize(), "f")


def make_answer(out: dict) -> str:
    """One French sentence, built only from the results."""
    rows, columns = out["rows"], out["columns"]
    if out["kind"] == "ask":
        return "Oui." if out["boolean"] else "Non."
    if not rows:
        return "Aucun résultat."
    if len(rows) == 1 and len(columns) == 1:
        cell = rows[0][columns[0]]
        return f"Résultat : {number(cell) if isinstance(cell, (int, float)) else cell}"
    items = []
    for row in rows[:8]:
        name = row.get("nom") or row.get("label") or next((v for v in row.values() if isinstance(v, str)), "")
        numbers = [number(v) for v in row.values() if isinstance(v, (int, float)) and not isinstance(v, bool)]
        items.append(f"{name} ({', '.join(numbers)})" if name and numbers else name or ", ".join(numbers))
    s = "s" if len(rows) > 1 else ""
    return f"J'ai trouvé {len(rows)} résultat{s} : {', '.join(items)}."


async def run(sparql: str, out: dict) -> None:
    """Check and run the query, then fill the table and the answer."""
    query = check(sparql)
    result = await fetch(query)
    out["sparql"] = query.replace(PREFIXES, "").strip()
    if "boolean" in result:
        out.update(kind="ask", boolean=result["boolean"])
    else:
        columns = result["head"]["vars"]
        rows = [{c: value(b.get(c)) for c in columns} for b in result["results"]["bindings"]]
        out.update(kind="select", columns=columns, rows=rows)
    out["answer"] = make_answer(out)


async def answer(question: str) -> dict:
    """Main entry point of the question box: NLP analysis -> SPARQL template -> Fuseki -> answer."""
    start = time.perf_counter()
    if not nlp.foods:
        await refresh()
    analysis = nlp.analyse(question.strip())
    intent = analysis["intent"]
    out = {"question": question.strip(), "language": "fr", "mode": "nlp", "sparql": None,
           "explanation": EXPLAIN.get(intent), "kind": None, "columns": [], "rows": [], "boolean": None,
           "answer": NOT_UNDERSTOOD, "nlp": analysis}
    if intent:   # out of scope: no query is run
        await run(TEMPLATES[intent](analysis), out)
    out["duration_ms"] = int((time.perf_counter() - start) * 1000)
    return out
