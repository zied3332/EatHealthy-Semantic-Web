
"""
EatHealthy - Natural Language to SPARQL.

Pipeline:
    French question
    -> spaCy / scikit-learn NLP
    -> intent + entities + numeric filters
    -> SPARQL template
    -> Apache Jena Fuseki
    -> structured response

No generative LLM is used.
"""

import re
import time
import unicodedata
from decimal import ROUND_HALF_UP, Decimal

import httpx
from fastapi import HTTPException
from rdflib.plugins.sparql import prepareQuery

from backend.queries.aliments import (
    CATEGORIES,
    HIGH_CARBON_MIN,
    LOW_CARBON_MAX,
    PREFIXES,
    list_foods,
    valid_id,
    value,
)
from backend.queries.meals import (
    MEAL_TYPES,
    NUTRIENTS,
    food_nutrients,
    meal_names,
)
from backend.services.fuseki_service import FUSEKI_ENDPOINT
from backend.services.nlp_aliments import NlpAliments


# ============================================================
# 1. CONFIGURATION
# ============================================================

CARBON = "EmpreinteCarbone"
DEFAULT_RESULT_LIMIT = 50
QUALITATIVE_RESULT_LIMIT = 10

DEMO = [
    "Combien de fruits y a-t-il ?",
    "Quels fruits ont moins de 100 calories et plus de 2 grammes de fibres ?",
    "Quels aliments sont riches en protéines ?",
    "Quels aliments contiennent peu de sucre ?",
    "Quels aliments sont faibles en calories et riches en fibres ?",
    "Quels aliments ont une faible empreinte carbone ?",
    "Quel aliment a la plus grosse empreinte carbone ?",
    "Compare la pomme et la banane",
    "Combien de glucides dans le déjeuner ?",
    "Quels aliments contient le dîner ?",
]

NOT_UNDERSTOOD = (
    "Je n'ai pas compris cette question. "
    "Essayez une question sur les aliments, les calories, "
    "les protéines, les fibres, le sucre ou l'environnement."
)

EXPLAIN = {
    "list": "Je recherche les aliments correspondant aux critères.",
    "value": "Je recherche une valeur nutritionnelle.",
    "extreme": "Je recherche la valeur la plus élevée ou la plus faible.",
    "count": "Je compte les aliments correspondants.",
    "average": "Je calcule une moyenne par catégorie.",
    "yes_no": "Je vérifie une condition dans l'ontologie.",
    "ranking": "Je classe les aliments selon leurs valeurs.",
    "compare": "Je compare plusieurs aliments.",
    "details": "Je présente les informations de l'aliment.",
    "meal_total": "Je calcule les nutriments des aliments du repas.",
    "meal_foods": "Je liste les aliments présents dans le repas.",
}

# Ontology property -> (SPARQL variable, triple pattern)
MEASURES = {
    "EmpreinteCarbone": (
        "co2",
        "?aliment eh:aImpact ?ic . "
        "?ic a eh:EmpreinteCarbone ; eh:valeurImpact ?co2 .",
    ),
    "EmpreinteEau": (
        "eau",
        "?aliment eh:aImpact ?ie . "
        "?ie a eh:EmpreinteEau ; eh:valeurImpact ?eau .",
    ),
    "aCalories": (
        "calories",
        "?aliment eh:aCalories ?calories .",
    ),
    "prixMoyen": (
        "prix",
        "?aliment eh:prixMoyen ?prix .",
    ),
    **{
        property_name: (
            variable,
            f"?aliment eh:{property_name} ?{variable} .",
        )
        for property_name, variable in NUTRIENTS.items()
        if property_name != "aCalories"
    },
}

LABEL = "OPTIONAL { ?aliment rdfs:label ?nom }"

nlp = NlpAliments()


# ============================================================
# 2. VOCABULARY
# ============================================================

def demo_questions() -> list[str]:
    return DEMO


async def refresh() -> None:
    """Load food and meal vocabulary from Fuseki."""

    foods = (await fetch(list_foods()))["results"]["bindings"]
    meals = (await fetch(meal_names()))["results"]["bindings"]

    food_vocabulary = [
        (
            value(row.get("label")) or value(row["food"]),
            value(row["food"]),
        )
        for row in foods
    ]

    meal_vocabulary = [
        (
            value(row.get("nom")) or value(row["repas"]),
            value(row["repas"]),
        )
        for row in meals
    ]

    nlp.set_vocabulary(food_vocabulary, meal_vocabulary)


# ============================================================
# 3. ENTITY HELPERS
# ============================================================

def ids(analysis: dict, kind: str) -> list[str]:
    """Return valid ontology identifiers for an entity type."""

    found = [
        entity["id"]
        for entity in analysis.get("entities", [])
        if entity.get("type") == kind
    ]

    return [
        identifier
        for identifier in dict.fromkeys(found)
        if valid_id(identifier)
    ]


def measures(
    analysis: dict,
    default=(CARBON,),
) -> list[str]:
    """Find numeric properties explicitly recognized by NLP."""

    found = [
        identifier
        for identifier in (
            ids(analysis, "IMPACT")
            + ids(analysis, "ATTRIBUTE")
        )
        if identifier in MEASURES
    ]

    return list(dict.fromkeys(found)) or list(default)


def body(lines: list[str]) -> str:
    return "\n  ".join(lines)


def columns_of(columns: list[str]) -> str:
    return " ".join(f"?{column}" for column in columns)


def normalize_text(text: str) -> str:
    """Normalize French text for qualitative expression matching."""

    text = unicodedata.normalize("NFKD", text.lower())

    return "".join(
        character
        for character in text
        if not unicodedata.combining(character)
    )


# ============================================================
# 4. QUALITATIVE NUTRITION ANALYSIS
# ============================================================

# These are application ranking preferences, not medical
# thresholds or dietary prescriptions.

LOW_WORDS = (
    "faible",
    "faibles",
    "pauvre",
    "pauvres",
    "peu de",
    "peu d",
    "moins de",
    "minimum",
    "reduire",
    "reduits",
    "reduites",
)

HIGH_WORDS = (
    "riche",
    "riches",
    "eleve",
    "eleves",
    "elevee",
    "elevees",
    "beaucoup de",
    "plus de",
    "maximum",
)

MEASURE_WORDS = {
    "aCalories": (
        "calorie",
        "calories",
        "kcal",
        "calorique",
        "caloriques",
    ),
    "EmpreinteCarbone": (
        "empreinte carbone",
        "carbone",
        "co2",
    ),
    "EmpreinteEau": (
        "empreinte eau",
        "consommation d eau",
        "eau",
    ),
    "prixMoyen": (
        "prix",
        "cout",
    ),
}

# Build aliases from the actual ontology nutrient mapping.
for property_name, variable in NUTRIENTS.items():
    if property_name not in MEASURE_WORDS:
        MEASURE_WORDS[property_name] = (
            normalize_text(variable),
            normalize_text(property_name),
        )

# Common French variants.
EXTRA_ALIASES = {
    "aProteines": ("proteine", "proteines", "protein"),
    "aFibres": ("fibre", "fibres"),
    "aSucre": ("sucre", "sucres"),
    "aGlucides": ("glucide", "glucides"),
    "aLipides": ("lipide", "lipides", "graisse", "graisses"),
}

for property_name, aliases in EXTRA_ALIASES.items():
    if property_name in MEASURES:
        MEASURE_WORDS[property_name] = tuple(
            dict.fromkeys(
                MEASURE_WORDS.get(property_name, ()) + aliases
            )
        )


def qualitative_preferences(analysis: dict) -> list[tuple[str, str]]:
    """
    Return (ontology property, sort direction).

    Examples:
        riches en protéines -> DESC(proteines)
        peu de sucre -> ASC(sucre)
        faibles en calories et riches en fibres
            -> ASC(calories), DESC(fibres)

    Does not invent numerical thresholds.
    """

    question = normalize_text(analysis.get("question", ""))

    if not question:
        return []

    requested = measures(analysis, default=())

    # Recover attributes directly from the question if the
    # NLP entity matcher did not recognize their wording.
    for property_name, aliases in MEASURE_WORDS.items():
        if property_name not in MEASURES:
            continue

        if any(
            re.search(
                r"(?<!\w)" + re.escape(alias) + r"(?!\w)",
                question,
            )
            for alias in aliases
        ):
            if property_name not in requested:
                requested.append(property_name)

    preferences = []

    for property_name in requested:
        aliases = MEASURE_WORDS.get(property_name, ())

        occurrences = []

        for alias in aliases:
            for match in re.finditer(
                r"(?<!\w)" + re.escape(alias) + r"(?!\w)",
                question,
            ):
                occurrences.append(match.start())

        if not occurrences:
            continue

        position = min(occurrences)

        # Examine the phrase immediately preceding this measure.
        context = question[max(0, position - 55):position]

        low_matches = [
            context.rfind(word)
            for word in LOW_WORDS
            if word in context
        ]

        high_matches = [
            context.rfind(word)
            for word in HIGH_WORDS
            if word in context
        ]

        last_low = max(low_matches, default=-1)
        last_high = max(high_matches, default=-1)

        if last_low < 0 and last_high < 0:
            # Only infer direction for clear preference language.
            if property_name == "EmpreinteCarbone" and (
                "ecologique" in question
                or "environnement" in question
            ):
                direction = "ASC"
            else:
                continue
        else:
            direction = "ASC" if last_low > last_high else "DESC"

        preferences.append((property_name, direction))

    return preferences


# ============================================================
# 5. SHARED SPARQL FILTERS
# ============================================================

def filters(
    analysis: dict,
    extra=(),
) -> tuple[list[str], list[str]]:
    """
    Convert entities and numeric slots into SPARQL conditions.

    Important:
    A generic 'low' or 'high' entity must not automatically
    become a carbon-footprint filter.
    """

    categories = " ".join(
        "eh:" + category
        for category in ids(analysis, "CATEGORY") or CATEGORIES
    )

    lines = [
        f"VALUES ?categorie {{ {categories} }} "
        "?aliment a ?categorie ."
    ]

    columns = []

    def need(measure: str) -> str:
        variable, triples = MEASURES[measure]

        if variable not in columns:
            columns.append(variable)
            lines.append(triples)

        return variable

    for measure in extra:
        if measure in MEASURES:
            need(measure)

    slots = analysis.get("slots", {})
    levels = ids(analysis, "LEVEL")

    # Explicit numeric comparisons remain authoritative.
    for item in slots.get("numbers", []):
        measure = item.get("measure")
        operator = item.get("op")
        numeric_value = item.get("value")

        if (
            measure not in MEASURES
            or operator not in ("<", "<=", ">", ">=", "=")
        ):
            continue

        try:
            numeric_value = float(numeric_value)
        except (TypeError, ValueError):
            continue

        lines.append(
            f"FILTER(?{need(measure)} "
            f"{operator} {numeric_value:g})"
        )

    # Only use carbon thresholds when carbon is the subject.
    carbon_requested = CARBON in (
        ids(analysis, "IMPACT")
        + ids(analysis, "ATTRIBUTE")
    )

    # Qualitative rankings do not need arbitrary thresholds.
    has_qualitative_carbon = any(
        measure == CARBON
        for measure, _ in qualitative_preferences(analysis)
    )

    if carbon_requested and not has_qualitative_carbon:
        if "low" in levels:
            lines.append(
                f"FILTER(?{need(CARBON)} <= {LOW_CARBON_MAX:g})"
            )

        if "high" in levels:
            lines.append(
                f"FILTER(?{need(CARBON)} >= {HIGH_CARBON_MIN:g})"
            )

    # Preserve the existing sustainability definition.
    if "sustainable" in levels:
        lines.append(
            f"FILTER(?{need(CARBON)} <= {LOW_CARBON_MAX:g})"
        )
        lines.append("?aliment eh:estLocal true .")

    for flag in ids(analysis, "ATTRIBUTE"):
        if flag in ("estBio", "estLocal"):
            expected = (
                "false"
                if slots.get("negation")
                else "true"
            )
            lines.append(f"?aliment eh:{flag} {expected} .")

    for diet in ids(analysis, "DIET"):
        lines.append(
            f"?aliment eh:compatibleAvecRegime ?r{diet} . "
            f"?r{diet} a eh:{diet} ."
        )

    return lines, columns


# ============================================================
# 6. LIST QUERY
# ============================================================

def list_query(a: dict) -> str:
    """
    List foods with explicit numeric filters or qualitative
    ranking preferences.

    A qualitative request returns at most 10 ranked foods.
    """

    preferences = qualitative_preferences(a)

    numeric_measures = [
        item.get("measure")
        for item in a.get("slots", {}).get("numbers", [])
        if item.get("measure") in MEASURES
    ]

    requested = list(dict.fromkeys(
        numeric_measures
        + [measure for measure, _ in preferences]
    ))

    lines, columns = filters(a, requested)

    order_parts = []

    for measure, direction in preferences:
        variable = MEASURES[measure][0]
        order_parts.append(f"{direction}(?{variable})")

    if not order_parts:
        order_parts = [
            f"ASC(?{columns[0]})"
        ] if columns else ["ASC(STR(?aliment))"]

    # Qualitative requests return a focused shortlist.
    limit = (
        QUALITATIVE_RESULT_LIMIT
        if preferences
        else DEFAULT_RESULT_LIMIT
    )

    return (
        f"SELECT DISTINCT ?aliment ?nom "
        f"{columns_of(columns)} WHERE {{\n"
        f"  {body(lines)}\n"
        f"  {LABEL}\n"
        f"}} ORDER BY {' '.join(order_parts)} "
        f"LIMIT {limit}"
    )


# ============================================================
# 7. EXTREME AND RANKING
# ============================================================

def sorted_query(a: dict, limit: int) -> str:
    preferences = qualitative_preferences(a)

    if preferences:
        measure, direction = preferences[0]
    else:
        measure = measures(a)[0]
        direction = (
            "ASC"
            if a["slots"].get("order") == "ASC"
            else "DESC"
        )

    lines, columns = filters(a, [measure])

    variable = MEASURES[measure][0]

    requested_limit = a["slots"].get("limit") or limit
    requested_limit = max(
        1,
        min(int(requested_limit), DEFAULT_RESULT_LIMIT),
    )

    return (
        f"SELECT DISTINCT ?aliment ?nom "
        f"{columns_of(columns)} WHERE {{\n"
        f"  {body(lines)}\n"
        f"  {LABEL}\n"
        f"}} ORDER BY {direction}(?{variable}) "
        f"LIMIT {requested_limit}"
    )


# ============================================================
# 8. COUNT
# ============================================================

def count_query(a: dict) -> str:
    lines, _ = filters(a)

    return (
        "SELECT (COUNT(DISTINCT ?aliment) AS ?nombre) "
        f"WHERE {{\n  {body(lines)}\n}}"
    )


# ============================================================
# 9. AVERAGE
# ============================================================

def average_query(a: dict) -> str:
    measure = measures(a)[0]

    lines, _ = filters(a, [measure])

    variable = MEASURES[measure][0]
    average_variable = f"moyenne_{variable}"

    return (
        f"SELECT ?categorie "
        f"(AVG(?{variable}) AS ?{average_variable}) "
        f"WHERE {{\n  {body(lines)}\n}} "
        f"GROUP BY ?categorie "
        f"ORDER BY DESC(?{average_variable})"
    )


# ============================================================
# 10. SINGLE VALUE
# ============================================================

def value_query(a: dict) -> str:
    foods = ids(a, "FOOD")

    if not foods:
        raise ValueError("Aucun aliment identifié.")

    wanted = measures(a)

    triples = [
        MEASURES[measure][1]
        for measure in wanted
    ]

    columns = [
        MEASURES[measure][0]
        for measure in wanted
    ]

    return (
        f"SELECT ?aliment ?nom {columns_of(columns)} "
        f"WHERE {{\n"
        f"  VALUES ?aliment {{ eh:{foods[0]} }}\n"
        f"  {LABEL}\n"
        f"  {body(triples)}\n"
        f"}}"
    )


# ============================================================
# 11. YES / NO
# ============================================================

def yes_no_query(a: dict) -> str:
    foods = ids(a, "FOOD")

    if not foods:
        raise ValueError("Aucun aliment identifié.")

    lines, _ = filters(a)

    return (
        f"ASK {{\n"
        f"  VALUES ?aliment {{ eh:{foods[0]} }}\n"
        f"  {body(lines)}\n"
        f"}}"
    )


# ============================================================
# 12. COMPARE
# ============================================================

def compare_query(a: dict) -> str:
    foods = ids(a, "FOOD")

    if len(foods) < 2:
        raise ValueError(
            "Deux aliments sont nécessaires pour une comparaison."
        )

    wanted = measures(
        a,
        default=(CARBON, "EmpreinteEau", "aCalories"),
    )

    food_values = " ".join(
        "eh:" + food
        for food in foods
    )

    optional = [
        f"OPTIONAL {{ {MEASURES[measure][1]} }}"
        for measure in wanted
    ]

    columns = [
        MEASURES[measure][0]
        for measure in wanted
    ]

    return (
        f"SELECT ?aliment ?nom {columns_of(columns)} "
        f"WHERE {{\n"
        f"  VALUES ?aliment {{ {food_values} }}\n"
        f"  {LABEL}\n"
        f"  {body(optional)}\n"
        f"}}"
    )


# ============================================================
# 13. DETAILS
# ============================================================

def details_query(a: dict) -> str:
    foods = ids(a, "FOOD")

    if not foods:
        raise ValueError("Aucun aliment identifié.")

    return list_foods(foods[0])


# ============================================================
# 14. MEAL FILTER
# ============================================================

def meal_filter(a: dict) -> str:
    meals = ids(a, "MEAL")

    selected_types = [
        meal
        for meal in meals
        if meal in MEAL_TYPES
    ] or MEAL_TYPES

    types = " ".join(
        "eh:" + meal_type
        for meal_type in selected_types
    )

    named_meals = [
        meal
        for meal in meals
        if meal not in MEAL_TYPES and meal != "Repas"
    ]

    named = " ".join(
        "eh:" + meal
        for meal in named_meals
    )

    result = (
        f"VALUES ?type {{ {types} }} "
        "?repas a ?type ."
    )

    if named:
        result += f" VALUES ?repas {{ {named} }}"

    return result


# ============================================================
# 15. MEAL TOTAL
# ============================================================

def meal_total_query(a: dict) -> str:
    wanted = [
        NUTRIENTS[measure]
        for measure in measures(a)
        if measure in NUTRIENTS
    ] or [
        "calories",
        "glucides",
        "proteines",
        "lipides",
    ]

    sums = " ".join(
        f"(SUM(COALESCE(?f_{key}, 0)) AS ?total_{key})"
        for key in wanted
    )

    direction = (
        "ASC"
        if a["slots"].get("order") == "ASC"
        else "DESC"
    )

    limit = a["slots"].get("limit") or (
        1 if a["slots"].get("order") else 50
    )

    limit = max(1, min(int(limit), DEFAULT_RESULT_LIMIT))

    return (
        f"SELECT ?repas ?nom {sums} WHERE {{\n"
        f"  {meal_filter(a)}\n"
        f"  ?repas eh:contientAliment ?aliment .\n"
        f"  {{ {food_nutrients('f_')} }}\n"
        f"  OPTIONAL {{ ?repas rdfs:label ?nom }}\n"
        f"}} GROUP BY ?repas ?nom "
        f"HAVING (COUNT(?aliment) > 0) "
        f"ORDER BY {direction}(?total_{wanted[0]}) "
        f"LIMIT {limit}"
    )


# ============================================================
# 16. MEAL FOODS
# ============================================================

def meal_foods_query(a: dict) -> str:
    return (
        f"SELECT ?repas ?aliment ?nom WHERE {{\n"
        f"  {meal_filter(a)}\n"
        f"  ?repas eh:contientAliment ?aliment .\n"
        f"  OPTIONAL {{ ?aliment rdfs:label ?nom }}\n"
        f"}} ORDER BY ?repas ?nom"
    )


# ============================================================
# 17. INTENT -> SPARQL TEMPLATES
# ============================================================

TEMPLATES = {
    "list": list_query,
    "extreme": lambda a: sorted_query(a, 1),
    "ranking": lambda a: sorted_query(a, 50),
    "count": count_query,
    "average": average_query,
    "value": value_query,
    "yes_no": yes_no_query,
    "compare": compare_query,
    "details": details_query,
    "meal_total": meal_total_query,
    "meal_foods": meal_foods_query,
}


# ============================================================
# 18. SPARQL SAFETY CHECK
# ============================================================

FORBIDDEN = re.compile(
    r"\b(INSERT|DELETE|LOAD|CLEAR|DROP|CREATE|SERVICE)\b",
    re.IGNORECASE,
)


def check(sparql: str) -> str:
    """
    Validate a read-only SPARQL query and add prefixes.
    """

    query = re.sub(
        r"(?i)PREFIX\s+[\w-]*:\s*<[^>]*>",
        "",
        sparql or "",
    ).strip()

    code = re.sub(
        r'"[^"]*"|\?\w+|<[^>\s]*>',
        " ",
        query,
    )

    if FORBIDDEN.search(code):
        raise ValueError(
            "Only read queries (SELECT or ASK) are allowed."
        )

    try:
        form = prepareQuery(PREFIXES + query).algebra.name
    except Exception as exc:
        raise ValueError(
            f"Invalid SPARQL: {exc}"
        ) from exc

    if form not in ("SelectQuery", "AskQuery"):
        raise ValueError(
            "Only SELECT and ASK queries are allowed."
        )

    if (
        form == "SelectQuery"
        and not re.search(r"(?i)\bLIMIT\s+\d+", code)
    ):
        query += f"\nLIMIT {DEFAULT_RESULT_LIMIT}"

    return PREFIXES + query


# ============================================================
# 19. FUSEKI EXECUTION
# ============================================================

async def fetch(query: str) -> dict:
    """Execute a SPARQL query on Fuseki."""

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                FUSEKI_ENDPOINT,
                data={"query": query},
                headers={
                    "Accept": "application/sparql-results+json"
                },
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail="Unable to retrieve data from Fuseki",
        ) from exc

    if response.status_code >= 400:
        raise ValueError(
            "Fuseki error: " + response.text[:200]
        )

    return response.json()


# ============================================================
# 20. ANSWER FORMATTING
# ============================================================

def number(x) -> str:
    return format(
        Decimal(str(x)).quantize(
            Decimal("0.01"),
            ROUND_HALF_UP,
        ).normalize(),
        "f",
    )


def make_answer(out: dict) -> str:
    """
    Generate a French response using only Fuseki results.
    """

    rows = out["rows"]
    columns = out["columns"]

    if out["kind"] == "ask":
        return "Oui." if out["boolean"] else "Non."

    if not rows:
        return (
            "Aucun résultat ne correspond aux critères "
            "de cette recherche."
        )

    intent = out.get("nlp", {}).get("intent")

    if intent == "count" and rows:
        total = rows[0].get("nombre", 0)
        return (
            f"La base de connaissances contient "
            f"{total} aliment(s) correspondant à votre recherche."
        )

    if len(rows) == 1 and len(columns) == 1:
        cell = rows[0][columns[0]]

        formatted = (
            number(cell)
            if isinstance(cell, (int, float))
            else cell
        )

        return f"Résultat : {formatted}"

    if intent == "list":
        names = []

        for row in rows[:10]:
            food = (
                row.get("nom")
                or row.get("aliment")
                or row.get("label")
            )

            if food:
                names.append(
                    str(food).split("#")[-1].split("/")[-1]
                )

        if names:
            return (
                f"Voici {len(rows)} aliment(s) correspondant "
                f"aux critères ou au classement demandé : "
                + ", ".join(names)
                + "."
            )

    items = []

    for row in rows[:8]:
        name = (
            row.get("nom")
            or row.get("label")
            or next(
                (
                    item
                    for item in row.values()
                    if isinstance(item, str)
                ),
                "",
            )
        )

        numeric_values = [
            number(item)
            for item in row.values()
            if isinstance(item, (int, float))
            and not isinstance(item, bool)
        ]

        if name and numeric_values:
            items.append(
                f"{name} ({', '.join(numeric_values)})"
            )
        elif name:
            items.append(str(name))
        else:
            items.append(", ".join(numeric_values))

    suffix = "s" if len(rows) > 1 else ""

    return (
        f"J'ai trouvé {len(rows)} résultat{suffix} : "
        + ", ".join(items)
        + "."
    )


# ============================================================
# 21. EXECUTE QUERY
# ============================================================

async def run(sparql: str, out: dict) -> None:
    """Validate, execute and format a SPARQL query."""

    query = check(sparql)
    result = await fetch(query)

    out["sparql"] = query

    if "boolean" in result:
        out.update(
            kind="ask",
            boolean=result["boolean"],
        )
    else:
        columns = result["head"]["vars"]

        rows = [
            {
                column: value(binding.get(column))
                for column in columns
            }
            for binding in result["results"]["bindings"]
        ]

        out.update(
            kind="select",
            columns=columns,
            rows=rows,
        )

    out["answer"] = make_answer(out)


# ============================================================
# 22. MAIN ENTRY POINT
# ============================================================

async def answer(question: str) -> dict:
    """
    Natural language question -> NLP -> SPARQL -> Fuseki.
    """

    start = time.perf_counter()

    if not nlp.foods:
        await refresh()

    question = question.strip()

    analysis = nlp.analyse(question)

    # Required for qualitative ranking.
    analysis["question"] = question

    intent = analysis.get("intent")

    out = {
        "question": question,
        "language": "fr",
        "mode": "nlp",
        "sparql": None,
        "explanation": EXPLAIN.get(intent),
        "kind": None,
        "columns": [],
        "rows": [],
        "boolean": None,
        "answer": NOT_UNDERSTOOD,
        "nlp": analysis,
    }

    if intent and intent in TEMPLATES:
        await run(
            TEMPLATES[intent](analysis),
            out,
        )

    out["duration_ms"] = int(
        (time.perf_counter() - start) * 1000
    )

    return out
