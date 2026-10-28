"""AI question box: Groq writes SPARQL, we check it, Fuseki runs it, the answer comes only from the results."""

import json
import logging
import os
import re
import time
from decimal import ROUND_HALF_UP, Decimal

import groq
import httpx
from fastapi import HTTPException
from rdflib.plugins.sparql import prepareQuery

from backend.queries.aliments import PREFIXES, value
from backend.services.fuseki_service import FUSEKI_ENDPOINT

logger = logging.getLogger("eathealthy.ai")

DEFAULT_MODEL = "openai/gpt-oss-120b"
BUSY = "The AI is busy (free plan limit). Wait a few seconds and try again."
NO_KEY = "The AI is not set up (no GROQ_API_KEY in backend/.env). Click one of the example questions."
FAILED = "I could not write a valid query for this question. Try to ask it in another way."

SYSTEM_PROMPT = """Tu traduis une question (français ou anglais) en UNE requête SPARQL 1.1, SELECT ou ASK, pour l'ontologie OWL EatHealthy.
Réponds seulement en JSON : {"sparql": "...", "explanation": "<phrase courte dans la langue de la question>", "language": "fr" ou "en"}
Règles : n'écris pas de PREFIX (eh:, rdf:, rdfs:, owl:, xsd: sont déclarés). Utilise seulement les termes du schéma. Le nom d'un aliment est rdfs:label, toujours dans un OPTIONAL. Les identifiants sont en CamelCase sans accents (eh:Pomme, eh:PainBlanc, eh:Boeuf, eh:DatteDegletNour). Mets LIMIT 50 (LIMIT 1 pour « le plus » ou « le moins »).
Si la question ne parle pas des aliments : {"sparql": "", "explanation": "<dis poliment que tu réponds seulement sur les aliments et leur impact>", "language": "..."}
Schéma (préfixe eh:) :
- Catégories, sous-classes de eh:Aliment : eh:Fruit eh:Legume eh:Cereale eh:Viande eh:Poisson eh:ProduitLaitier. Tous les aliments : ?a a ?c . VALUES ?c { eh:Fruit eh:Legume eh:Cereale eh:Viande eh:Poisson eh:ProduitLaitier }
- Aliment : eh:aCalories (kcal pour 100 g), eh:prixMoyen, eh:estBio et eh:estLocal (true ou false).
- Impact : ?a eh:aImpact ?i . ?i a eh:EmpreinteCarbone (kg CO2e par kg) ou eh:EmpreinteEau (litres par kg) ; ?i eh:valeurImpact ?v .
- Faible carbone (low carbon) : ?v <= 2. Fort (high carbon) : ?v >= 10. Durable (sustainable) : faible carbone ET eh:estLocal true.
- Régimes : ?a eh:compatibleAvecRegime ?r . ?r a eh:Vegan (ou eh:Vegetarien, eh:Omnivore).
- Nutriments : ?a eh:contientNutriment ?n . ?n a eh:Proteine (ou eh:Glucide, eh:Lipide, eh:Vitamine, eh:Mineral).
- Repas : ?m eh:contientAliment ?a . ?m a eh:PetitDejeuner (ou eh:Dejeuner, eh:Diner, eh:Collation)."""

# Few-shot examples sent to Groq: (question, sparql, explanation, language).
EXAMPLES = [
    ("Quels légumes ont une faible empreinte carbone ?",
     "SELECT ?aliment ?nom ?co2 WHERE { ?aliment a eh:Legume ; eh:aImpact ?i . ?i a eh:EmpreinteCarbone ; "
     "eh:valeurImpact ?co2 . OPTIONAL { ?aliment rdfs:label ?nom } FILTER(?co2 <= 2) } ORDER BY ?co2 LIMIT 50",
     "Je cherche les légumes dont l'empreinte carbone est au plus 2 kg CO2e par kg.", "fr"),
    ("Quel aliment a la plus petite empreinte en eau ?",
     "SELECT ?aliment ?nom ?eau WHERE { ?aliment eh:aImpact ?i . ?i a eh:EmpreinteEau ; eh:valeurImpact ?eau . "
     "OPTIONAL { ?aliment rdfs:label ?nom } } ORDER BY ?eau LIMIT 1",
     "Je cherche l'aliment qui a la plus petite empreinte en eau.", "fr"),
    ("Quelle est l'empreinte eau moyenne par catégorie ?",
     "SELECT ?categorie (AVG(?eau) AS ?moyenneEau) WHERE { VALUES ?categorie { eh:Fruit eh:Legume eh:Cereale "
     "eh:Viande eh:Poisson eh:ProduitLaitier } ?aliment a ?categorie ; eh:aImpact ?i . ?i a eh:EmpreinteEau ; "
     "eh:valeurImpact ?eau . } GROUP BY ?categorie ORDER BY DESC(?moyenneEau) LIMIT 50",
     "Je calcule l'empreinte eau moyenne de chaque catégorie.", "fr"),
    ("Le poulet est-il bio ?", "ASK { eh:Poulet eh:estBio true }", "Je vérifie si le poulet est bio.", "fr"),
    ("How many dairy products are there?",
     "SELECT (COUNT(DISTINCT ?aliment) AS ?nombre) WHERE { ?aliment a eh:ProduitLaitier . }",
     "I count the foods in the dairy category.", "en"),
]

# The 9 demo questions with their saved SPARQL: (question, sparql, language).
# They are NOT sent to Groq (so they really test it); they are used when Groq is busy.
DEMO = [
    ("Quels fruits locaux ont une faible empreinte carbone ?",
     "SELECT ?aliment ?nom ?co2 WHERE { ?aliment a eh:Fruit ; eh:estLocal true ; eh:aImpact ?i . "
     "?i a eh:EmpreinteCarbone ; eh:valeurImpact ?co2 . OPTIONAL { ?aliment rdfs:label ?nom } "
     "FILTER(?co2 <= 2) } ORDER BY ?co2 LIMIT 50", "fr"),
    ("Quel aliment a la plus grosse empreinte carbone ?",
     "SELECT ?aliment ?nom ?co2 WHERE { ?aliment eh:aImpact ?i . ?i a eh:EmpreinteCarbone ; "
     "eh:valeurImpact ?co2 . OPTIONAL { ?aliment rdfs:label ?nom } } ORDER BY DESC(?co2) LIMIT 1", "fr"),
    ("Quel aliment consomme le plus d'eau ?",
     "SELECT ?aliment ?nom ?eau WHERE { ?aliment eh:aImpact ?i . ?i a eh:EmpreinteEau ; "
     "eh:valeurImpact ?eau . OPTIONAL { ?aliment rdfs:label ?nom } } ORDER BY DESC(?eau) LIMIT 1", "fr"),
    ("Quelle est l'empreinte carbone moyenne par catégorie ?",
     "SELECT ?categorie (AVG(?co2) AS ?moyenneCO2) WHERE { VALUES ?categorie { eh:Fruit eh:Legume eh:Cereale "
     "eh:Viande eh:Poisson eh:ProduitLaitier } ?aliment a ?categorie ; eh:aImpact ?i . ?i a eh:EmpreinteCarbone ; "
     "eh:valeurImpact ?co2 . } GROUP BY ?categorie ORDER BY DESC(?moyenneCO2) LIMIT 50", "fr"),
    ("Combien de fruits y a-t-il ?",
     "SELECT (COUNT(DISTINCT ?aliment) AS ?nombre) WHERE { ?aliment a eh:Fruit . }", "fr"),
    ("Quels aliments de moins de 100 kcal ont une faible empreinte carbone ?",
     "SELECT ?aliment ?nom ?calories ?co2 WHERE { ?aliment eh:aCalories ?calories ; eh:aImpact ?i . "
     "?i a eh:EmpreinteCarbone ; eh:valeurImpact ?co2 . OPTIONAL { ?aliment rdfs:label ?nom } "
     "FILTER(?calories < 100 && ?co2 <= 2) } ORDER BY ?calories LIMIT 50", "fr"),
    ("Quels aliments végans ont une faible empreinte carbone ?",
     "SELECT DISTINCT ?aliment ?nom ?co2 WHERE { ?aliment eh:compatibleAvecRegime ?r ; eh:aImpact ?i . "
     "?r a eh:Vegan . ?i a eh:EmpreinteCarbone ; eh:valeurImpact ?co2 . OPTIONAL { ?aliment rdfs:label ?nom } "
     "FILTER(?co2 <= 2) } ORDER BY ?co2 LIMIT 50", "fr"),
    ("Le saumon est-il un aliment local ?", "ASK { eh:Saumon eh:estLocal true }", "fr"),
    ("Which foods are sustainable?",
     "SELECT ?aliment ?nom ?co2 WHERE { ?aliment eh:estLocal true ; eh:aImpact ?i . ?i a eh:EmpreinteCarbone ; "
     "eh:valeurImpact ?co2 . OPTIONAL { ?aliment rdfs:label ?nom } FILTER(?co2 <= 2) } ORDER BY ?co2 LIMIT 50", "en"),
]

# Saved queries used when Groq is busy: question -> (sparql, language).
SAVED = {e[0].lower(): (e[1], e[3]) for e in EXAMPLES} | {d[0].lower(): (d[1], d[2]) for d in DEMO}


def demo_questions() -> list[str]:
    return [d[0] for d in DEMO]


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
    """One sentence in the question's language, built only from the results."""
    fr = out["language"] == "fr"
    rows, columns = out["rows"], out["columns"]
    if out["kind"] == "ask":
        return ("Oui." if out["boolean"] else "Non.") if fr else ("Yes." if out["boolean"] else "No.")
    if not rows:
        return "Aucun résultat." if fr else "No results."
    if len(rows) == 1 and len(columns) == 1:
        cell = rows[0][columns[0]]
        cell = number(cell) if isinstance(cell, (int, float)) else cell
        return f"Résultat : {cell}" if fr else f"Result: {cell}"
    items = []
    for row in rows[:8]:
        name = row.get("nom") or row.get("label") or next((v for v in row.values() if isinstance(v, str)), "")
        numbers = [number(v) for v in row.values() if isinstance(v, (int, float)) and not isinstance(v, bool)]
        items.append(f"{name} ({', '.join(numbers)})" if name and numbers else name or ", ".join(numbers))
    s = "s" if len(rows) > 1 else ""
    if fr:
        return f"J'ai trouvé {len(rows)} résultat{s} : {', '.join(items)}."
    return f"I found {len(rows)} result{s}: {', '.join(items)}."


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


# ---------------------------------------------------------------- Groq

async def chat(messages: list[dict]) -> str:
    """One Groq call. Raises groq.APIError when Groq is busy or unreachable."""
    model = os.getenv("GROQ_MODEL") or DEFAULT_MODEL
    extra = {"reasoning_effort": "low"} if model.startswith("openai/gpt-oss") else {}
    client = groq.AsyncGroq(api_key=os.getenv("GROQ_API_KEY"), timeout=20, max_retries=1)
    try:
        response = await client.chat.completions.create(
            model=model, messages=messages, temperature=0, max_completion_tokens=1000,
            response_format={"type": "json_object"}, **extra)
    except groq.BadRequestError:   # for example: the model did not write valid JSON
        return ""
    return response.choices[0].message.content or ""


async def ask_groq(question: str, out: dict) -> bool:
    """Groq writes the query; one retry with the error. True when the answer is ready."""
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for q, sparql, explanation, language in EXAMPLES:
        reply = json.dumps({"sparql": sparql, "explanation": explanation, "language": language}, ensure_ascii=False)
        messages += [{"role": "user", "content": q}, {"role": "assistant", "content": reply}]
    messages.append({"role": "user", "content": question})

    for _ in range(2):
        reply = await chat(messages)
        try:
            data = json.loads(reply)
            out.update(language=data.get("language") if data.get("language") in ("fr", "en") else "fr",
                       explanation=data.get("explanation"), model=os.getenv("GROQ_MODEL") or DEFAULT_MODEL)
            if not data["sparql"].strip():   # the question is not about foods
                out.update(mode="groq", answer=out["explanation"] or "I only answer questions about foods.")
                return True
            await run(data["sparql"], out)
            out["mode"] = "groq"
            return True
        except (ValueError, KeyError, TypeError, AttributeError) as error:
            messages += [{"role": "assistant", "content": reply or "{}"},
                         {"role": "user", "content": f"Erreur : {error}. Corrige la requête."}]
    return False


async def answer(question: str) -> dict:
    """Main entry point of the question box."""
    start = time.perf_counter()
    question = question.strip()
    out = {"question": question, "language": "fr", "mode": "none", "model": None, "sparql": None,
           "explanation": None, "kind": None, "columns": [], "rows": [], "boolean": None, "answer": ""}
    problem = NO_KEY
    if os.getenv("GROQ_API_KEY"):
        try:
            problem = None if await ask_groq(question, out) else FAILED
        except groq.APIError:   # rate limit, timeout or no connection
            problem = BUSY
    if problem:
        out.update(model=None, explanation=None)
        saved = SAVED.get(question.lower())
        if saved:   # a saved example question: run its saved SPARQL
            out.update(language=saved[1], mode="example")
            await run(saved[0], out)
        else:
            out["answer"] = problem
    out["duration_ms"] = int((time.perf_counter() - start) * 1000)
    logger.info("ask mode=%s problem=%s ms=%s", out["mode"], problem, out["duration_ms"])
    return out
