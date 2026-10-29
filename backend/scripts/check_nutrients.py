"""Check the ontology plus live nutrient data with HermiT; no database writes."""
from pathlib import Path
import tempfile

import httpx
from owlready2 import World, sync_reasoner
from rdflib import Graph

from backend.queries.aliments import PREFIXES
from backend.services.fuseki_service import FUSEKI_ENDPOINT


def main():
    graph = Graph().parse(Path(__file__).resolve().parents[2] / "ontology/eathealthy.rdf")
    # Remove seed nutrient instances and associations before loading the live version.
    graph.update(PREFIXES + """DELETE { ?n ?p ?o } WHERE {
        ?n a ?t . ?t rdfs:subClassOf* eh:Nutriment . ?n ?p ?o }""")
    graph.update(PREFIXES + "DELETE WHERE { ?f eh:contientNutriment ?n }")
    query = PREFIXES + """CONSTRUCT { ?n ?p ?o . ?f eh:contientNutriment ?n . ?f a ?ft }
    WHERE { ?n a ?t . ?t rdfs:subClassOf* eh:Nutriment . ?n ?p ?o .
      OPTIONAL { { ?f eh:contientNutriment ?n } UNION { ?n eh:estNutrimentDe ?f }
        OPTIONAL { ?f a ?ft } } }"""
    response = httpx.post(FUSEKI_ENDPOINT, data={"query": query}, headers={"Accept": "application/n-triples"}, timeout=20)
    response.raise_for_status()
    graph.parse(data=response.text, format="nt")
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "nutrients.owl"
        graph.serialize(path, format="xml")
        world = World()
        world.get_ontology("file://" + path.resolve().as_posix()).load()
        sync_reasoner(world, debug=0)
    print("HermiT: ontology and live nutrient data are consistent.")


if __name__ == "__main__":
    main()
