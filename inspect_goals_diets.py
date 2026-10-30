from pathlib import Path
from rdflib import Graph, Namespace, RDF, RDFS, OWL

path = Path("ontology/eathealthy.rdf")

g = Graph()
g.parse(path, format="xml")

EH = Namespace(
    "http://www.semanticweb.org/thinkpad/ontologies/2026/9/EatHealthy#"
)

terms = [
    "aObjectif",
    "suitRegime",
    "aProfil",
    "PriseMasse",
    "PertePoids",
    "MaintienPoids",
    "Vegan",
    "Vegetarien",
    "SansGluten",
]

for name in terms:
    uri = EH[name]

    print(f"\n========== {name} ==========")

    for predicate, obj in g.predicate_objects(uri):
        if predicate in (
            RDF.type,
            RDFS.domain,
            RDFS.range,
            RDFS.subClassOf,
        ):
            print(
                predicate.split("#")[-1],
                "->",
                obj.split("#")[-1],
            )

    individuals = list(g.subjects(RDF.type, uri))
    print("Individuals:", [
        str(item).split("#")[-1]
        for item in individuals
    ])

    relationships = list(g.subject_objects(uri))
    print("Relationships:", [
        (
            str(subject).split("#")[-1],
            str(obj).split("#")[-1],
        )
        for subject, obj in relationships[:10]
    ])
