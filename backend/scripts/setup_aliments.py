"""One-time demo data for the food module: schema axioms, labels, 3 new foods and 20 impacts.

Run:  python -m backend.scripts.setup_aliments
Safe to run many times: every update only adds what is missing, it never overwrites.
"""

import asyncio
from pathlib import Path

from rdflib import Graph

from backend.queries.aliments import DEFAULT_SOURCE, IMPACTS, PREFIXES, dec, literal
from backend.services.fuseki_service import execute_sparql, execute_sparql_update

MODULE_TTL = Path(__file__).resolve().parents[2] / "ontology" / "aliments-module.ttl"

# Our World in Data, Poore & Nemecek (2018), world averages per kg of food.
# (id, label, category, new food?, kg CO2e/kg, L/kg, OWID category)
DEMO_FOODS = [
    ("Pomme", "Pomme", "Fruit", False, 0.43, 180.1, "Apples"),
    ("Banane", "Banane", "Fruit", False, 0.86, 114.5, "Bananas"),
    ("Brocoli", "Brocoli", "Legume", False, 0.51, 119.4, "Brassicas"),
    ("Lentilles", "Lentilles", "Legume", False, 1.79, 435.7, "Other Pulses"),
    ("PainBlanc", "Pain blanc", "Cereale", False, 1.57, 647.5, "Wheat & Rye"),
    ("Poulet", "Poulet", "Viande", False, 9.87, 660, "Poultry Meat"),
    ("Saumon", "Saumon", "Poisson", False, 13.63, 3691.3, "Fish (farmed)"),
    ("Boeuf", "Bœuf", "Viande", True, 99.48, 1451.2, "Beef (beef herd)"),
    ("Fromage", "Fromage", "ProduitLaitier", True, 23.88, 5605.2, "Cheese"),
    ("Lait", "Lait", "ProduitLaitier", True, 3.15, 628.2, "Milk"),
]


def updates() -> list[str]:
    """All setup updates. Each one has a FILTER, so it only adds what is missing."""
    # 1. Module axioms (aliments-module.ttl), if not installed yet.
    axioms = Graph().parse(MODULE_TTL, format="turtle").serialize(format="nt")
    result = [PREFIXES + f"INSERT {{ {axioms} }} WHERE "
              "{ FILTER NOT EXISTS { eh:AlimentFaibleCarbone owl:equivalentClass ?c } }"]
    for food, label, category, new, co2, water, owid in DEMO_FOODS:
        # 2. New foods (type only), if the ID is not used yet.
        if new:
            result.append(PREFIXES + f"INSERT {{ eh:{food} a eh:{category} }} "
                          f"WHERE {{ FILTER NOT EXISTS {{ eh:{food} ?p ?o }} }}")
        # 3. A French label, if the food has none.
        result.append(PREFIXES + f"INSERT {{ eh:{food} rdfs:label {literal(label)}@fr }} "
                      f"WHERE {{ eh:{food} a ?type FILTER NOT EXISTS {{ eh:{food} rdfs:label ?l }} }}")
        # 4. Carbon and water impacts, if the food exists and the impact does not.
        for impact_type, number in (("EmpreinteCarbone", co2), ("EmpreinteEau", water)):
            prefix, unit = IMPACTS[impact_type]
            impact = f"eh:{prefix}{food}"
            result.append(PREFIXES + f"""
INSERT {{ {impact} a eh:{impact_type} ; eh:valeurImpact {dec(number)} ; eh:uniteImpact {literal(unit)} ;
           eh:sourceImpact {literal(f"{DEFAULT_SOURCE}: {owid}")} .
         eh:{food} eh:aImpact {impact} . }}
WHERE {{ FILTER (EXISTS {{ eh:{food} a ?type }} && NOT EXISTS {{ {impact} ?p ?o }}) }}""")
    return result


async def count_triples() -> int:
    rows = await execute_sparql("SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }")
    return int(rows[0]["n"]["value"])


async def main() -> None:
    before = await count_triples()
    for update in updates():
        await execute_sparql_update(update)
    added = await count_triples() - before
    print(f"Added {added} triples." if added else "Nothing to add: the demo data is already there.")


if __name__ == "__main__":
    asyncio.run(main())
