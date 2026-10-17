
from fastapi import FastAPI, HTTPException
import httpx

app = FastAPI(
    title="EatHealthy API",
    description="Semantic nutrition API powered by Apache Jena Fuseki",
    version="0.1.0",
)

FUSEKI_ENDPOINT = "http://localhost:3030/eathealthy/query"

FOODS_QUERY = """
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX eh: <http://www.semanticweb.org/thinkpad/ontologies/2026/9/EatHealthy#>

SELECT DISTINCT ?aliment ?type
WHERE {
    ?aliment rdf:type ?type .
    ?type rdfs:subClassOf* eh:Aliment .
    FILTER(isIRI(?aliment))
}
ORDER BY ?aliment
"""


@app.get("/")
def home():
    return {
        "message": "Welcome to EatHealthy API",
        "version": "0.1.0",
    }


@app.get("/api/foods")
async def get_foods():
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                FUSEKI_ENDPOINT,
                data={"query": FOODS_QUERY},
                headers={"Accept": "application/sparql-results+json"},
            )
            response.raise_for_status()

        bindings = response.json()["results"]["bindings"]

        foods = []
        for row in bindings:
            food_uri = row["aliment"]["value"]
            type_uri = row["type"]["value"]

            foods.append({
                "uri": food_uri,
                "name": food_uri.rsplit("#", 1)[-1],
                "category": type_uri.rsplit("#", 1)[-1],
            })

        return {
            "count": len(foods),
            "foods": foods,
        }

    except (httpx.HTTPError, ValueError, KeyError) as exc:
        raise HTTPException(
            status_code=502,
            detail="Unable to retrieve food data from Fuseki",
        ) from exc

DIETS_QUERY = """
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX eh: <http://www.semanticweb.org/thinkpad/ontologies/2026/9/EatHealthy#>

SELECT DISTINCT ?regime ?type
WHERE {
    ?regime rdf:type ?type .
    ?type rdfs:subClassOf* eh:RegimeAlimentaire .
    FILTER(isIRI(?regime))
}
ORDER BY ?regime
"""


@app.get("/api/diets")
async def get_diets():
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                FUSEKI_ENDPOINT,
                data={"query": DIETS_QUERY},
                headers={"Accept": "application/sparql-results+json"},
            )
            response.raise_for_status()

        bindings = response.json()["results"]["bindings"]

        diets = []
        for row in bindings:
            regime_uri = row["regime"]["value"]
            type_uri = row["type"]["value"]

            diets.append({
                "uri": regime_uri,
                "name": regime_uri.rsplit("#", 1)[-1],
                "type": type_uri.rsplit("#", 1)[-1],
            })

        return {
            "count": len(diets),
            "diets": diets,
        }

    except (httpx.HTTPError, ValueError, KeyError) as exc:
        raise HTTPException(
            status_code=502,
            detail="Unable to retrieve dietary regimes from Fuseki",
        ) from exc
