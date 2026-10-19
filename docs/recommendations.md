# Recommendation Engine

The recommendation engine retrieves semantic relationships
from the EatHealthy ontology using SPARQL.

## Matching Criteria

1. Health goal compatibility
2. Dietary regime compatibility
3. Activity profile compatibility

## Scoring

The matching score counts positive RDF relationships.
It does not represent nutritional quality.

## Restrictions

Explicitly incompatible foods are excluded.

Missing restriction data is treated as unknown,
not as evidence of safety.
