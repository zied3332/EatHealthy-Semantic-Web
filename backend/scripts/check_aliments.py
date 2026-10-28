"""HermiT check: is the ontology + Fuseki data consistent, and which foods are in the 3 defined classes?

Run:  python -m backend.scripts.check_aliments      (needs Java for HermiT)
"""

from pathlib import Path

import httpx
from owlready2 import OwlReadyInconsistentOntologyError, World, sync_reasoner
from rdflib import Graph, URIRef
from rdflib.namespace import RDF

from backend.queries.aliments import CATEGORIES, EH, IMPACTS, PREFIXES, co2_level, list_foods, value
from backend.services.fuseki_service import FUSEKI_ENDPOINT

ONTOLOGY = Path(__file__).resolve().parents[2] / "ontology"
DEMO_FILE = ONTOLOGY / "demo" / "eathealthy-demo.owl"
CLASSES = ["AlimentFaibleCarbone", "AlimentFortCarbone", "AlimentDurable"]

# The foods and impacts stored in Fuseki (no user accounts: their values are plain strings).
FOODS_AND_IMPACTS = PREFIXES + f"""
CONSTRUCT {{ ?s ?p ?o }} WHERE {{
  VALUES ?c {{ {" ".join("eh:" + c for c in [*CATEGORIES, *IMPACTS])} }}
  ?s a ?c ; ?p ?o .
}}"""


def build_graph() -> Graph:
    """eathealthy.rdf + aliments-module.ttl, with the foods and impacts taken from Fuseki."""
    graph = Graph().parse(ONTOLOGY / "eathealthy.rdf").parse(ONTOLOGY / "aliments-module.ttl")
    for c in [*CATEGORIES, *IMPACTS]:   # Fuseki is the truth for foods and impacts
        for subject in list(graph.subjects(RDF.type, URIRef(EH + c))):
            graph.remove((subject, None, None))
    data = httpx.post(FUSEKI_ENDPOINT, data={"query": FOODS_AND_IMPACTS},
                      headers={"Accept": "application/n-triples"}, timeout=20).text
    return graph.parse(data=data, format="nt")


def run_hermit(graph: Graph, path: Path = DEMO_FILE) -> dict | None:
    """Save the graph as RDF/XML, run HermiT. Returns {class: [foods]}, or None if inconsistent."""
    path.parent.mkdir(parents=True, exist_ok=True)
    graph.serialize(path, format="xml")
    world = World()
    onto = world.get_ontology("file://" + path.resolve().as_posix()).load()
    try:
        with onto:
            sync_reasoner(world, infer_property_values=False, debug=0)
    except OwlReadyInconsistentOntologyError:
        return None
    return {name: sorted(i.name for i in world[EH + name].instances(world=world)) for name in CLASSES}


def app_rule() -> dict:
    """The rule used by the app (same thresholds), computed from Fuseki."""
    rows = httpx.post(FUSEKI_ENDPOINT, data={"query": list_foods()},
                      headers={"Accept": "application/sparql-results+json"}, timeout=20).json()
    foods = [(value(r["food"]), co2_level(value(r.get("co2"))), value(r.get("local")))
             for r in rows["results"]["bindings"]]
    return {"AlimentFaibleCarbone": sorted(f for f, level, _ in foods if level == "low"),
            "AlimentFortCarbone": sorted(f for f, level, _ in foods if level == "high"),
            "AlimentDurable": sorted(f for f, level, local in foods if level == "low" and local is True)}


if __name__ == "__main__":
    classes = run_hermit(build_graph())
    print(f"File for Protégé: {DEMO_FILE}")
    if classes is None:
        print("INCONSISTENT: HermiT found a contradiction in the data.")
    else:
        print("Consistent: yes")
        rule = app_rule()
        for name in CLASSES:
            print(f"  {name}: {', '.join(classes[name]) or '-'}")
        print("Matches the app:", "yes" if classes == rule else f"NO (app: {rule})")
