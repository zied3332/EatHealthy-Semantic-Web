
"""
EatHealthy — Ontology Data Generator

Expands the existing EatHealthy ontology with synthetic demo data.

Features:
- Preserves existing RDF triples
- Uses existing OWL classes and properties
- Adds fictional people, meals, recommendations, and relationships
- Avoids duplicate RDF triples
- Handles Windows file paths correctly
- Produces an expanded RDF/XML file

Usage:
    python ontology/build_eathealthy_ontology.py

Or:
    python ontology/build_eathealthy_ontology.py input.rdf output.rdf

Requirements:
    pip install rdflib
"""

import sys
from collections import Counter
from pathlib import Path

from rdflib import Graph, Namespace, RDF, RDFS, OWL, Literal, URIRef


# ============================================================
# 1. CONFIGURATION
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

SRC = (
    Path(sys.argv[1]).resolve()
    if len(sys.argv) > 1
    else BASE_DIR / "eathealthy.rdf"
)

OUT = (
    Path(sys.argv[2]).resolve()
    if len(sys.argv) > 2
    else BASE_DIR / "eathealthy_full_demo.rdf"
)

EH = Namespace(
    "http://www.semanticweb.org/thinkpad/ontologies/2026/9/EatHealthy#"
)

graph = Graph()
graph.bind("eh", EH)


# ============================================================
# 2. LOAD EXISTING ONTOLOGY
# ============================================================

if not SRC.is_file():
    raise FileNotFoundError(
        f"Ontology file not found: {SRC}"
    )

if SRC == OUT:
    raise ValueError(
        "Input and output must be different files."
    )

print("=" * 65)
print("EATHEALTHY — ONTOLOGY DATA GENERATOR")
print("=" * 65)

print(f"\nLoading ontology: {SRC}")

with SRC.open("rb") as file:
    graph.parse(file=file, format="xml")

original_triples = len(graph)

print(f"Original RDF triples: {original_triples}")


# ============================================================
# 3. ONTOLOGY HELPERS
# ============================================================

existing_classes = set(
    graph.subjects(RDF.type, OWL.Class)
)

existing_classes.update(
    graph.subjects(RDF.type, RDFS.Class)
)

existing_properties = set()

for property_type in (
    OWL.ObjectProperty,
    OWL.DatatypeProperty,
    RDF.Property,
):
    existing_properties.update(
        graph.subjects(RDF.type, property_type)
    )


def class_exists(class_name):
    return EH[class_name] in existing_classes


def property_exists(property_name):
    return EH[property_name] in existing_properties


def add_literal(subject, property_name, value):
    """Add a literal only if the property exists."""

    if value is None:
        return

    if not property_exists(property_name):
        return

    graph.add(
        (
            subject,
            EH[property_name],
            Literal(value),
        )
    )


def link(subject, property_name, obj):
    """Add an object relationship using an existing property."""

    if not property_exists(property_name):
        return False

    graph.add(
        (
            subject,
            EH[property_name],
            obj,
        )
    )

    return True


def add_individual(identifier, class_name, **attributes):
    """Create an individual of an existing ontology class."""

    if not class_exists(class_name):
        return None

    subject = EH[identifier]

    graph.add(
        (subject, RDF.type, OWL.NamedIndividual)
    )

    graph.add(
        (subject, RDF.type, EH[class_name])
    )

    graph.add(
        (
            subject,
            RDFS.comment,
            Literal(
                "Synthetic demonstration data. "
                "Not intended as medical or nutritional advice."
            ),
        )
    )

    for property_name, value in attributes.items():
        add_literal(subject, property_name, value)

    return subject


def ensure_individual(identifier, class_name):
    """Reuse or create an individual."""

    subject = EH[identifier]

    if (subject, RDF.type, EH[class_name]) in graph:
        return subject

    return add_individual(identifier, class_name)


def get_individuals(class_name):
    """Return individuals directly typed as a class."""

    return sorted(
        set(
            graph.subjects(
                RDF.type,
                EH[class_name],
            )
        ),
        key=str,
    )


def safe_link(subject, property_name, obj):
    if subject is None or obj is None:
        return False

    return link(subject, property_name, obj)


def choose(items, index):
    """Safely select an item from a list."""

    if not items:
        return None

    return items[index % len(items)]


# ============================================================
# 4. EXISTING FOOD INDIVIDUALS
# ============================================================

food_classes = [
    "Fruit",
    "Legume",
    "Cereale",
    "Viande",
    "Poisson",
    "ProduitLaitier",
]

foods = {
    class_name: get_individuals(class_name)
    for class_name in food_classes
}

all_foods = sorted(
    set(
        food
        for items in foods.values()
        for food in items
    ),
    key=str,
)

print(f"\nFood individuals found: {len(all_foods)}")

for class_name, items in foods.items():
    print(f"  {class_name}: {len(items)}")


# ============================================================
# 5. DIETARY REGIMES
# ============================================================

regime_definitions = [
    ("RegimeOmnivore1", "Omnivore"),
    ("RegimeVegetarien1", "Vegetarien"),
    ("RegimeVegan1", "Vegan"),
    ("RestrictionSansGluten1", "SansGluten"),
]

regimes = []

for identifier, class_name in regime_definitions:
    regime = ensure_individual(
        identifier,
        class_name,
    )

    if regime is not None:
        regimes.append(regime)


# ============================================================
# 6. HEALTH OBJECTIVES
# ============================================================

goal_definitions = [
    ("ObjectifPriseMasse1", "PriseMasse"),
    ("ObjectifPertePoids1", "PertePoids"),
    ("ObjectifMaintienPoids1", "MaintienPoids"),
]

goals = []

for identifier, class_name in goal_definitions:
    goal = ensure_individual(
        identifier,
        class_name,
    )

    if goal is not None:
        goals.append(goal)


# ============================================================
# 7. ACTIVITY PROFILES
# ============================================================

profile_definitions = [
    ("ProfilSportif1", "ProfilSportif"),
    ("ProfilSedentaire1", "ProfilSedentaire"),
    ("ProfilActifDemo1", "ProfilActif"),
]

profiles = []

for identifier, class_name in profile_definitions:
    profile = ensure_individual(
        identifier,
        class_name,
    )

    if profile is not None:
        profiles.append(profile)


# ============================================================
# 8. ADD INDIVIDUALS TO EXISTING CLASSES
# ============================================================

extra_individuals = {
    "Vitamine": [
        "VitamineC_Demo",
        "VitamineB12_Demo",
        "VitamineD_Demo",
    ],
    "Mineral": [
        "Fer_Demo",
        "Calcium_Demo",
        "Magnesium_Demo",
    ],
    "Glucide": [
        "GlucideComplexe_Demo",
    ],
    "Proteine": [
        "ProteineDemo",
    ],
    "Lipide": [
        "LipideDemo",
    ],
    "Allergie": [
        "AllergieArachideDemo",
    ],
    "Intolerance": [
        "IntoleranceLactoseDemo",
    ],
    "InterdictionAlimentaire": [
        "InterdictionArachideDemo",
    ],
    "RestrictionAlimentaire": [
        "RestrictionSansLactoseDemo",
    ],
    "EmpreinteCarbone": [
        "EmpreinteCarboneFaibleDemo",
    ],
    "EmpreinteEau": [
        "EmpreinteEauFaibleDemo",
    ],
    "Saisonnalite": [
        "SaisonEteDemo",
        "SaisonHiverDemo",
    ],
    "ProfilActif": [
        "ProfilActifDemo1",
    ],
    "ProfilSportif": [
        "ProfilSportifDemo2",
    ],
    "ProfilSedentaire": [
        "ProfilSedentaireDemo2",
    ],
    "Enfant": [
        "EnfantDemo1",
    ],
    "Adulte": [
        "AdulteDemo1",
    ],
    "Senior": [
        "SeniorDemo1",
    ],
    "AlimentationEquilibree": [
        "AlimentationEquilibreeDemo1",
    ],
    "AlimentDurable": [
        "AlimentDurableDemo1",
    ],
    "AlimentFaibleCarbone": [
        "AlimentFaibleCarboneDemo1",
    ],
    "AlimentFortCarbone": [
        "AlimentFortCarboneDemo1",
    ],
    "PetitDejeuner": [
        "PetitDejeunerDemo01",
    ],
    "Collation": [
        "CollationDemo01",
    ],
    "Dejeuner": [
        "DejeunerDemo01",
    ],
    "Diner": [
        "DinerDemo01",
    ],
    "PriseMasse": [
        "ObjectifPriseMasseDemo2",
    ],
    "PertePoids": [
        "ObjectifPertePoidsDemo2",
    ],
    "MaintienPoids": [
        "ObjectifMaintienPoidsDemo2",
    ],
    "Omnivore": [
        "RegimeOmnivoreDemo2",
    ],
    "Vegetarien": [
        "RegimeVegetarienDemo2",
    ],
    "Vegan": [
        "RegimeVeganDemo2",
    ],
    "SansGluten": [
        "RegimeSansGlutenDemo2",
    ],
}

for class_name, identifiers in extra_individuals.items():

    if not class_exists(class_name):
        continue

    for identifier in identifiers:
        ensure_individual(
            identifier,
            class_name,
        )


# ============================================================
# 9. NUTRIENTS
# ============================================================

nutrient_definitions = [
    ("VitamineC_Demo", "Vitamine"),
    ("Fer_Demo", "Mineral"),
    ("ProteineDemo", "Proteine"),
    ("GlucideComplexe_Demo", "Glucide"),
    ("LipideDemo", "Lipide"),
]

nutrients = []

for identifier, class_name in nutrient_definitions:
    nutrient = ensure_individual(
        identifier,
        class_name,
    )

    if nutrient is not None:
        nutrients.append(nutrient)


# ============================================================
# 10. FOOD RELATIONSHIPS
# ============================================================

print("\nGenerating food relationships...")

for class_name, items in foods.items():

    for index, food in enumerate(items):

        nutrient = choose(nutrients, index)

        safe_link(
            food,
            "contientNutriment",
            nutrient,
        )

        safe_link(
            nutrient,
            "estNutrimentDe",
            food,
        )

        # Omnivore compatibility
        if regimes:
            safe_link(
                food,
                "compatibleAvecRegime",
                regimes[0],
            )

        # Vegetarian compatibility
        if (
            class_name not in ("Viande", "Poisson")
            and len(regimes) > 1
        ):
            safe_link(
                food,
                "compatibleAvecRegime",
                regimes[1],
            )

        # Vegan compatibility
        if (
            class_name not in (
                "Viande",
                "Poisson",
                "ProduitLaitier",
            )
            and len(regimes) > 2
        ):
            safe_link(
                food,
                "compatibleAvecRegime",
                regimes[2],
            )

        safe_link(
            food,
            "adapteAObjectif",
            choose(goals, index),
        )

        safe_link(
            food,
            "compatibleAvecProfil",
            choose(profiles, index),
        )

        # Illustrative environmental impact
        impact = add_individual(
            f"ImpactDemo_{class_name}_{index + 1:03}",
            "ImpactEnvironnemental",
            valeurImpact=round(
                0.2 + (index % 9) * 0.35,
                2,
            ),
            uniteImpact="indice illustratif",
        )

        safe_link(
            food,
            "aImpact",
            impact,
        )

        safe_link(
            impact,
            "estImpactDe",
            food,
        )

        # Illustrative alternatives
        if len(items) > 1:
            alternative = items[
                (index + 1) % len(items)
            ]

            safe_link(
                food,
                "alternativeA",
                alternative,
            )


# ============================================================
# 11. FICTIONAL PERSON PROFILES
# ============================================================

print("Generating fictional profiles...")

people = []

for index in range(1, 25):

    person = add_individual(
        f"PersonneFictiveDemo{index:02}",
        "Personne",
        aNom=f"Profil fictif {index:02}",
        aAge=20 + index % 45,
    )

    if person is None:
        continue

    people.append(person)

    regime = choose(regimes, index)
    goal = choose(goals, index)
    profile = choose(profiles, index)

    safe_link(
        person,
        "suitRegime",
        regime,
    )

    safe_link(
        regime,
        "regimeSuiviPar",
        person,
    )

    safe_link(
        person,
        "aObjectif",
        goal,
    )

    safe_link(
        goal,
        "estObjectifDe",
        person,
    )

    safe_link(
        person,
        "aProfil",
        profile,
    )

    safe_link(
        profile,
        "estProfilDe",
        person,
    )

    safe_link(
        person,
        "prefereAliment",
        choose(all_foods, index),
    )

    safe_link(
        person,
        "consomme",
        choose(all_foods, index * 3),
    )


# ============================================================
# 12. MEALS
# ============================================================

print("Generating meals...")

meal_types = [
    "PetitDejeuner",
    "Dejeuner",
    "Diner",
    "Collation",
]

meal_hours = [
    "08:00",
    "12:30",
    "19:30",
    "16:00",
]

meals = []

for index in range(1, 49):

    position = (index - 1) % len(meal_types)

    class_name = meal_types[position]

    meal = add_individual(
        f"RepasFictifDemo{index:03}",
        class_name,
        heureRecommandee=meal_hours[position],
    )

    if meal is None:
        continue

    meals.append(meal)

    for offset in range(3):

        food = choose(
            all_foods,
            index * 7 + offset * 13,
        )

        safe_link(
            meal,
            "contientAliment",
            food,
        )

        safe_link(
            food,
            "appartientARepas",
            meal,
        )

    safe_link(
        meal,
        "repasAdapteAObjectif",
        choose(goals, index),
    )

    if regimes:
        safe_link(
            meal,
            "repasCompatibleAvecRegime",
            regimes[0],
        )


# ============================================================
# 13. RECOMMENDATIONS
# ============================================================

print("Generating recommendations...")

for index in range(1, 37):

    recommendation = add_individual(
        f"RecommandationFictiveDemo{index:03}",
        "Recommandation",
        scoreRecommandation=round(
            0.5 + (index % 10) * 0.04,
            2,
        ),
    )

    if recommendation is None:
        continue

    person = choose(
        people,
        index - 1,
    )

    food = choose(
        all_foods,
        index * 5,
    )

    meal = choose(
        meals,
        index - 1,
    )

    safe_link(
        recommendation,
        "pourPersonne",
        person,
    )

    safe_link(
        person,
        "recoitRecommandation",
        recommendation,
    )

    safe_link(
        recommendation,
        "recommandeAliment",
        food,
    )

    safe_link(
        recommendation,
        "recommandeRepas",
        meal,
    )

    safe_link(
        recommendation,
        "recommandationAdapteeAObjectif",
        choose(goals, index),
    )

    if regimes:
        safe_link(
            recommendation,
            "recommandationCompatibleAvecRegime",
            regimes[0],
        )

    safe_link(
        recommendation,
        "recommandationAdapteeAuProfil",
        choose(profiles, index),
    )


# ============================================================
# 14. VALIDATION SUMMARY
# ============================================================

print("\n" + "=" * 65)
print("ONTOLOGY VALIDATION SUMMARY")
print("=" * 65)

total_triples = len(graph)

new_triples = total_triples - original_triples

named_individuals = set(
    graph.subjects(
        RDF.type,
        OWL.NamedIndividual,
    )
)

class_counts = Counter()

for individual in named_individuals:

    for class_uri in graph.objects(
        individual,
        RDF.type,
    ):

        if class_uri in existing_classes:
            class_counts[class_uri] += 1

print(f"\nOriginal triples: {original_triples}")
print(f"Final triples: {total_triples}")
print(f"New triples: {new_triples}")
print(f"Named individuals: {len(named_individuals)}")

print("\nIndividuals by class:")

for class_uri, count in class_counts.most_common():

    class_name = str(class_uri).split("#")[-1]

    print(f"  {class_name}: {count}")


# ============================================================
# 15. SAVE EXPANDED ONTOLOGY
# ============================================================

OUT.parent.mkdir(
    parents=True,
    exist_ok=True,
)

graph.serialize(
    destination=str(OUT),
    format="xml",
)

# Confirm that the generated RDF can be parsed.
validation_graph = Graph()

with OUT.open("rb") as file:
    validation_graph.parse(
        file=file,
        format="xml",
    )

if len(validation_graph) != len(graph):
    raise RuntimeError(
        "RDF validation failed: triple counts differ."
    )

print("\n" + "=" * 65)
print("GENERATION COMPLETED")
print("=" * 65)

print(f"\nOutput file: {OUT}")
print(f"Validated triples: {len(validation_graph)}")
print("\nThe original ontology was not modified.")
