
"""
SPARQL queries for the EatHealthy User Profile module.

Retrieves existing people, health goals, and activity
profiles from the ontology stored in Apache Jena Fuseki.
"""

from backend.queries.nutrition import PREFIXES


# ============================================================
# AVAILABLE PROFILE OPTIONS
# ============================================================

PROFILE_OPTIONS_QUERY = PREFIXES + """
SELECT DISTINCT ?individual ?type ?category
WHERE {
    VALUES (?parentClass ?category) {
        (eh:Personne "person")
        (eh:ProfilSante "activity_profile")
        (eh:ObjectifSante "health_goal")
        (eh:RestrictionAlimentaire "restriction")
    }

    ?individual rdf:type ?type .
    ?type rdfs:subClassOf* ?parentClass .

    FILTER(isIRI(?individual))
    FILTER(
        STRSTARTS(
            STR(?individual),
            STR(eh:)
        )
    )
}
ORDER BY ?category ?type ?individual
"""


# ============================================================
# EXISTING PERSON RELATIONSHIPS
# ============================================================

# Retrieves semantic properties currently asserted for
# individuals of class Personne or its subclasses.
#
# This is a read-only query: it does not modify Fuseki.

PERSON_RELATIONSHIPS_QUERY = PREFIXES + """
SELECT DISTINCT ?person ?property ?value
WHERE {
    ?person rdf:type ?personType .
    ?personType rdfs:subClassOf* eh:Personne .

    ?person ?property ?value .

    FILTER(isIRI(?person))
    FILTER(
        STRSTARTS(
            STR(?person),
            STR(eh:)
        )
    )
}
ORDER BY ?person ?property ?value
"""
