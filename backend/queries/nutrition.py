
"""
SPARQL queries for the EatHealthy nutrition ontology.

These queries retrieve semantic data from Apache Jena Fuseki.
"""

PREFIXES = """
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX eh: <http://www.semanticweb.org/thinkpad/ontologies/2026/9/EatHealthy#>
"""


# Retrieve foods and their categories.
FOODS_QUERY = PREFIXES + """
SELECT DISTINCT ?aliment ?type
WHERE {
    ?aliment rdf:type ?type .
    ?type rdfs:subClassOf* eh:Aliment .
    FILTER(isIRI(?aliment))
}
ORDER BY ?aliment
"""


# Retrieve dietary regimes and their types.
DIETS_QUERY = PREFIXES + """
SELECT DISTINCT ?regime ?type
WHERE {
    ?regime rdf:type ?type .
    ?type rdfs:subClassOf* eh:RegimeAlimentaire .
    FILTER(isIRI(?regime))
}
ORDER BY ?regime
"""
