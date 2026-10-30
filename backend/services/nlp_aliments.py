"""

EatHealthy - French NLP / TALN for food questions.

Pipeline:

1. spaCy tokenization and lemmatization

2. PhraseMatcher entity recognition

3. difflib typo correction

4. TF-IDF + Logistic Regression intent classification

5. Rule-based numeric filters, ranking and negation detection

Compatible with:

- backend/nlp_data/intents_aliments.json

- backend/services/nl2sparql.py

No LLM API required.

"""

import json

import random

import re

import unicodedata

from difflib import get_close_matches

from pathlib import Path

import spacy

from sklearn.feature_extraction.text import TfidfVectorizer

from sklearn.linear_model import LogisticRegression

from sklearn.model_selection import GroupKFold, cross_val_score, cross_val_predict
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score

from sklearn.pipeline import make_pipeline, make_union

from spacy.matcher import PhraseMatcher

from spacy.tokens import Span

from spacy.util import filter_spans

# ============================================================
# 1. CONFIGURATION
# ============================================================
SPACY_MODEL = "fr_core_news_sm"

INTENTS_FILE = (

    Path(__file__).resolve().parents[1]

    / "nlp_data"

    / "intents_aliments.json"

)

TOOLS = [

    "spaCy fr_core_news_sm",

    "scikit-learn TF-IDF + LogisticRegression",

    "difflib",

    "rdflib",

]

MASKS = {

    "FOOD": "ent_food",

    "CATEGORY": "ent_cat",

    "IMPACT": "ent_impact",

    "ATTRIBUTE": "ent_attr",

    "DIET": "ent_diet",

    "LEVEL": "ent_level",

    "MEAL": "ent_meal",

}

VOCABULARY = [

    # Food categories
    ("fruit", "CATEGORY", "Fruit"),

    ("légume", "CATEGORY", "Legume"),

    ("céréale", "CATEGORY", "Cereale"),

    ("viande", "CATEGORY", "Viande"),

    ("poisson", "CATEGORY", "Poisson"),

    ("produit laitier", "CATEGORY", "ProduitLaitier"),

    ("produits laitiers", "CATEGORY", "ProduitLaitier"),

    ("laitage", "CATEGORY", "ProduitLaitier"),

    # Environmental impacts
    ("carbone", "IMPACT", "EmpreinteCarbone"),

    ("co2", "IMPACT", "EmpreinteCarbone"),

    ("émission", "IMPACT", "EmpreinteCarbone"),

    ("polluer", "IMPACT", "EmpreinteCarbone"),

    ("polluant", "IMPACT", "EmpreinteCarbone"),

    ("pollution", "IMPACT", "EmpreinteCarbone"),

    ("gaz à effet de serre", "IMPACT", "EmpreinteCarbone"),

    ("climat", "IMPACT", "EmpreinteCarbone"),

    ("empreinte carbone", "IMPACT", "EmpreinteCarbone"),

    ("eau", "IMPACT", "EmpreinteEau"),

    ("litre", "IMPACT", "EmpreinteEau"),

    ("water", "IMPACT", "EmpreinteEau"),

    ("empreinte eau", "IMPACT", "EmpreinteEau"),

    # Numeric attributes
    ("calorie", "ATTRIBUTE", "aCalories"),

    ("kcal", "ATTRIBUTE", "aCalories"),

    ("énergie", "ATTRIBUTE", "aCalories"),

    ("calorique", "ATTRIBUTE", "aCalories"),

    ("prix", "ATTRIBUTE", "prixMoyen"),

    ("coûter", "ATTRIBUTE", "prixMoyen"),

    ("cher", "ATTRIBUTE", "prixMoyen"),

    ("euro", "ATTRIBUTE", "prixMoyen"),

    ("price", "ATTRIBUTE", "prixMoyen"),

    ("glucide", "ATTRIBUTE", "aGlucides"),

    ("carb", "ATTRIBUTE", "aGlucides"),

    ("carbs", "ATTRIBUTE", "aGlucides"),

    ("protéine", "ATTRIBUTE", "aProteines"),

    ("lipide", "ATTRIBUTE", "aLipides"),

    ("graisse", "ATTRIBUTE", "aLipides"),

    ("fibre", "ATTRIBUTE", "aFibres"),

    ("sucre", "ATTRIBUTE", "aSucre"),

    ("sodium", "ATTRIBUTE", "aSodium"),

    ("sel", "ATTRIBUTE", "aSodium"),

    # Boolean attributes
    ("bio", "ATTRIBUTE", "estBio"),

    ("biologique", "ATTRIBUTE", "estBio"),

    ("organic", "ATTRIBUTE", "estBio"),

    ("local", "ATTRIBUTE", "estLocal"),

    ("localement", "ATTRIBUTE", "estLocal"),

    # Diets
    ("végan", "DIET", "Vegan"),

    ("vegan", "DIET", "Vegan"),

    ("végétalien", "DIET", "Vegan"),

    ("végétarien", "DIET", "Vegetarien"),

    ("omnivore", "DIET", "Omnivore"),

    # Levels
    ("faible", "LEVEL", "low"),

    ("bas", "LEVEL", "low"),

    ("fort", "LEVEL", "high"),

    ("élevé", "LEVEL", "high"),

    ("durable", "LEVEL", "sustainable"),

    ("écologique", "LEVEL", "sustainable"),

    ("sustainable", "LEVEL", "sustainable"),

    # Meals
    ("repas", "MEAL", "Repas"),

    ("meal", "MEAL", "Repas"),

    ("petit-déjeuner", "MEAL", "PetitDejeuner"),

    ("petit déjeuner", "MEAL", "PetitDejeuner"),

    ("breakfast", "MEAL", "PetitDejeuner"),

    ("déjeuner", "MEAL", "Dejeuner"),

    ("lunch", "MEAL", "Dejeuner"),

    ("dîner", "MEAL", "Diner"),

    ("dinner", "MEAL", "Diner"),

    ("collation", "MEAL", "Collation"),

    ("goûter", "MEAL", "Collation"),

    ("snack", "MEAL", "Collation"),

]

EXAMPLE_FOODS = [

    "pomme",

    "banane",

    "brocoli",

    "lentilles",

    "pain blanc",

    "poulet",

    "saumon",

    "bœuf",

    "fromage",

    "lait",

]

EXAMPLES = {

    "{CAT}": [

        "fruits",

        "légumes",

        "céréales",

        "viandes",

        "poissons",

        "produits laitiers",

    ],

    "{IMPACT}": [

        "carbone",

        "CO2",

        "eau",

        "émissions",

    ],

    "{ATTR}": [

        "calories",

        "kcal",

        "prix",

        "glucides",

        "protéines",

        "fibres",

    ],

    "{DIET}": [

        "végans",

        "végétariens",

        "omnivores",

    ],

    "{NUM}": ["2", "10", "50", "100", "300"],

    "{MEAL}": [

        "déjeuner",

        "dîner",

        "petit-déjeuner",

        "collation",

        "repas",

    ],

}

DOMAIN_WORDS = {

    "aliment",

    "nourriture",

    "manger",

    "produit",

    "plat",

    "food",

}

REQUIRED = {

    "value": ("FOOD", 1),

    "yes_no": ("FOOD", 1),

    "details": ("FOOD", 1),

    "compare": ("FOOD", 2),

    "meal_total": ("MEAL", 1),

    "meal_foods": ("MEAL", 1),

}

NUMERIC = {

    "EmpreinteCarbone",

    "EmpreinteEau",

    "aCalories",

    "prixMoyen",

    "aGlucides",

    "aProteines",

    "aLipides",

    "aFibres",

    "aSucre",

    "aSodium",

}

NEGATIONS = {"pas", "non", "sans", "ne"}

NUMBER = r"\d+(?:[.,]\d+)?"

# ============================================================
# 2. NORMALIZATION
# ============================================================
def normalize(text: str) -> str:

    """Lowercase, normalize ligatures and remove accents."""

    text = text.lower()

    text = text.replace("œ", "oe").replace("æ", "ae")

    return "".join(

        char

        for char in unicodedata.normalize("NFD", text)

        if unicodedata.category(char) != "Mn"

    )

# ============================================================
# 3. NLP CLASS
# ============================================================
class NlpAliments:

    """Analyze a food question and return intent, entities and slots."""

    def __init__(self):

        self.nlp = spacy.load(

            SPACY_MODEL,

            disable=["parser", "ner"],

        )

        self.foods = []

        # Temporary vocabulary for training phrases.
        self.set_vocabulary(

            [(food, food) for food in EXAMPLE_FOODS]

        )

        self.texts, self.labels, self.groups = (

            self.training_set()

        )

        self.classifier = make_pipeline(

            make_union(

                TfidfVectorizer(

                    analyzer="word",

                    ngram_range=(1, 2),

                    sublinear_tf=True,

                ),

                TfidfVectorizer(

                    analyzer="char_wb",

                    ngram_range=(2, 5),

                    sublinear_tf=True,

                ),

            ),

            LogisticRegression(

                C=10,

                max_iter=3000,

            ),

        )

        self.classifier.fit(

            self.texts,

            self.labels,

        )

        # Force vocabulary refresh from Fuseki.
        self.foods = []

    # ========================================================
    # 4. SPACY PARSING
    # ========================================================
    def parse(self, text: str):

        """Tokenize and normalize the text."""

        doc = self.nlp(text)

        for token in doc:

            source = (

                token.text

                if token.pos_ == "PROPN"

                else token.lemma_

            )

            token.norm_ = normalize(source)

        return doc

    # ========================================================
    # 5. VOCABULARY AND PHRASE MATCHER
    # ========================================================
    def set_vocabulary(

        self,

        foods: list[tuple[str, str]],

        meals: list[tuple[str, str]] = (),

    ) -> None:

        self.foods = sorted(set(foods))

        self.matcher = PhraseMatcher(

            self.nlp.vocab,

            attr="NORM",

        )

        self.single_words = {}

        terms = (

            VOCABULARY

            + [

                (label, "FOOD", food_id)

                for label, food_id in self.foods

            ]

            + [

                (label, "MEAL", meal_id)

                for label, meal_id in sorted(set(meals))

            ]

        )

        for text, kind, ident in terms:

            if not text or not ident:

                continue

            key = f"{kind}|{ident}"

            variants = {

                text,

                text.lower(),

                text + "s",

                text[:-1] if text.endswith("s") else text,

            }

            patterns = [

                self.parse(variant)

                for variant in variants

                if variant.strip()

            ]

            self.matcher.add(key, patterns)

            for pattern in patterns:

                if (

                    len(pattern) == 1

                    and len(pattern[0].norm_) >= 4

                ):

                    self.single_words.setdefault(

                        pattern[0].norm_,

                        key,

                    )

    # ========================================================
    # 6. ENTITY RECOGNITION
    # ========================================================
    def entities(self, doc) -> list[dict]:

        """Recognize entities and correct simple spelling mistakes."""

        spans = []

        for match_id, start, end in self.matcher(doc):

            key = self.nlp.vocab.strings[match_id]

            spans.append(

                Span(

                    doc,

                    start,

                    end,

                    label=key,

                )

            )

        spans = filter_spans(spans)

        covered = {

            index

            for span in spans

            for index in range(span.start, span.end)

        }

        found = [

            (span, False)

            for span in spans

        ]

        for token in doc:

            if token.i in covered:

                continue

            if token.is_stop or len(token.norm_) < 4:

                continue

            if token.pos_ not in {

                "NOUN", "ADJ", "PROPN", "VERB", "X"

            }:

                continue

            matches = get_close_matches(

                token.norm_,

                self.single_words.keys(),

                n=1,

                cutoff=0.85,

            )

            if not matches:

                matches = get_close_matches(

                    normalize(token.text),

                    self.single_words.keys(),

                    n=1,

                    cutoff=0.85,

                )

            if not matches:

                continue

            key = self.single_words[matches[0]]

            span = Span(

                doc,

                token.i,

                token.i + 1,

                label=key,

            )

            found.append((span, True))

            covered.add(token.i)

        result = []

        for span, corrected in sorted(

            found,

            key=lambda item: item[0].start,

        ):

            kind, ident = span.label_.split("|", 1)

            # "La plus faible" is a superlative.
            if kind == "LEVEL" and span.start > 0:

                previous = doc[span.start - 1].norm_

                if previous in {"plus", "moins"}:

                    continue

            result.append({

                "text": span.text,

                "type": kind,

                "id": ident,

                "corrected": corrected,

                "start": span.start,

                "end": span.end,

            })

        return result

    # ========================================================
    # 7. DELEXICALIZATION
    # ========================================================
    @staticmethod

    def masked(doc, entities: list[dict]) -> str:

        """Replace entities and numbers with generic tokens."""

        by_start = {

            entity["start"]: entity

            for entity in entities

        }

        words = []

        index = 0

        while index < len(doc):

            if index in by_start:

                entity = by_start[index]

                words.append(

                    MASKS[entity["type"]]

                )

                index = entity["end"]

                continue

            token = doc[index]

            if not token.is_punct:

                if re.fullmatch(NUMBER, token.text):

                    words.append("ent_num")

                else:

                    words.append(token.norm_)

            index += 1

        return " ".join(words)

    # ========================================================
    # 8. TRAINING DATASET
    # ========================================================
    def training_set(self):

        """Load training phrases and generate masked examples."""

        if not INTENTS_FILE.is_file():

            raise FileNotFoundError(

                f"Training dataset not found: {INTENTS_FILE}"

            )

        data = json.loads(

            INTENTS_FILE.read_text(encoding="utf-8")

        )

        intents = data["intents"]

        rng = random.Random(42)

        texts = []

        labels = []

        groups = []

        for intent, phrases in intents.items():

            for index, phrase in enumerate(phrases):

                repetitions = 3 if "{" in phrase else 1

                for _ in range(repetitions):

                    food, food2 = rng.sample(

                        EXAMPLE_FOODS,

                        2,

                    )

                    text = (

                        phrase

                        .replace("{FOOD}", food)

                        .replace("{FOOD2}", food2)

                    )

                    for holder, values in EXAMPLES.items():

                        text = text.replace(

                            holder,

                            rng.choice(values),

                        )

                    doc = self.parse(text)

                    entities = self.entities(doc)

                    texts.append(

                        self.masked(doc, entities)

                    )

                    labels.append(intent)

                    groups.append(

                        f"{intent}#{index}"

                    )

        return texts, labels, groups

    # ========================================================
    # 9. CROSS VALIDATION
    # ========================================================
    def cross_validation(self) -> float:

        """Grouped 5-fold cross-validation accuracy."""

        scores = cross_val_score(

            self.classifier,

            self.texts,

            self.labels,

            groups=self.groups,

            cv=GroupKFold(n_splits=5),

        )

        return float(scores.mean())

    def evaluation_report(self) -> dict:
        """Grouped 5-fold out-of-fold intent classification metrics."""
        predictions = cross_val_predict(
            self.classifier,
            self.texts,
            self.labels,
            groups=self.groups,
            cv=GroupKFold(n_splits=5),
        )
        labels = sorted(set(self.labels))
        report = classification_report(
            self.labels,
            predictions,
            labels=labels,
            output_dict=True,
            zero_division=0,
        )
        matrix = confusion_matrix(
            self.labels,
            predictions,
            labels=labels,
        )
        return {
            "accuracy": float(accuracy_score(self.labels, predictions)),
            "labels": labels,
            "report": report,
            "confusion_matrix": matrix.tolist(),
        }

    # ========================================================
    # 10. NUMERIC FILTERS AND SLOTS
    # ========================================================
    @staticmethod

    def slots(doc, entities: list[dict]) -> dict:

        """

        Extract:

        - Numeric comparisons

        - Ranking order

        - Top-N limits

        - Negation

        - Yes/no question indicators

        Output remains compatible with nl2sparql.py.

        """

        norms = [

            token.norm_

            for token in doc

        ]

        measures = [

            entity

            for entity in entities

            if entity["id"] in NUMERIC

        ]

        numbers = []

        limit = None

        used = set()

        # Match numeric comparisons in the original question.
        # Supports:
        #   moins de 100 calories
        #   plus de 2 grammes de fibres
        #   inférieur à 50 kcal
        #   au moins 10 protéines
        #   supérieur à 5
        comparison_pattern = re.compile(

            r"\b("

            r"moins\s+de|"

            r"plus\s+de|"

            r"inferieur(?:e)?\s+a|"

            r"superieur(?:e)?\s+a|"

            r"au\s+moins|"

            r"au\s+maximum|"

            r"au\s+plus|"

            r"minimum\s+de|"

            r"maximum\s+de|"

            r"sous|"

            r"depassant"

            r")\s+"

            r"(\d+(?:[.,]\d+)?)\b",

            re.IGNORECASE,

        )

        normalized_question = normalize(doc.text)

        # Character positions remain aligned for accent removal
        # in most French text, but token-based parsing below is
        # used for the actual measure association.
        for match in comparison_pattern.finditer(

            normalized_question

        ):

            phrase = match.group(1)

            numeric_text = match.group(2)

            value = float(

                numeric_text.replace(",", ".")

            )

            if phrase.startswith((

                "moins",

                "inferieur",

                "sous",

                "au plus",

                "au maximum",

                "maximum",

            )):

                op = "<=" if phrase.startswith((

                    "au plus",

                    "au maximum",

                    "maximum",

                )) else "<"

            elif phrase.startswith((

                "au moins",

                "minimum",

            )):

                op = ">="

            else:

                op = ">"

            # Find the corresponding numeric token.
            token_index = None

            for token in doc:

                if (

                    re.fullmatch(NUMBER, token.text)

                    and abs(

                        token.idx - match.start(2)

                    ) <= 3

                ):

                    token_index = token.i

                    break

            if token_index is None:

                continue

            # Prefer a measurement appearing after the number,
            # provided it belongs to the same comparison clause.
            next_comparison = comparison_pattern.search(

                normalized_question,

                match.end(),

            )

            clause_end = (

                next_comparison.start()

                if next_comparison

                else len(normalized_question)

            )

            candidates_after = [

                entity

                for entity in measures

                if (

                    entity["start"] > token_index

                    and doc[

                        entity["start"]

                    ].idx < clause_end

                )

            ]

            candidates_before = [

                entity

                for entity in measures

                if entity["end"] <= token_index

            ]

            selected = None

            if candidates_after:

                selected = min(

                    candidates_after,

                    key=lambda entity: (

                        entity["start"] - token_index

                    ),

                )

            elif candidates_before:

                selected = min(

                    candidates_before,

                    key=lambda entity: (

                        token_index - entity["end"]

                    ),

                )

            # Do not silently interpret an unknown measurement
            # as carbon footprint.
            if selected is None:

                continue

            numbers.append({

                "op": op,

                "value": value,

                "measure": selected["id"],

            })

            used.add(token_index)

        # Top-N detection
        top_match = re.search(

            r"\btop\s+(\d+)\b",

            normalized_question,

        )

        if top_match:

            limit = max(

                1,

                min(int(top_match.group(1)), 50),

            )

        else:

            count_match = re.search(

                r"\b(?:les|des)\s+(\d+)\s+aliments\b",

                normalized_question,

            )

            if count_match:

                limit = max(

                    1,

                    min(int(count_match.group(1)), 50),

                )

        # Sorting
        order = None

        ascending_patterns = [

            r"\bmoins\s+cher\b",

            r"\bmoins\s+polluant\b",

            r"\bmoins\s+calorique\b",

            r"\bplus\s+faible\b",

            r"\bplus\s+petit\b",

            r"\bminimum\b",

            r"\bminimal\b",

            r"\bcroissant\b",

            r"\bdu\s+moins\b",

        ]

        descending_patterns = [

            r"\bplus\s+cher\b",

            r"\bplus\s+polluant\b",

            r"\bplus\s+calorique\b",

            r"\bplus\s+gros\b",

            r"\bplus\s+grand\b",

            r"\bplus\s+haut\b",

            r"\bmaximum\b",

            r"\bmaximal\b",

            r"\bdecroissant\b",

            r"\bdu\s+plus\b",

        ]

        for pattern in ascending_patterns:

            if re.search(pattern, normalized_question):

                order = "ASC"

                break

        if order is None:

            for pattern in descending_patterns:

                if re.search(

                    pattern,

                    normalized_question,

                ):

                    order = "DESC"

                    break

        # For rankings, the default is descending.
        if (

            order is None

            and re.search(

                r"\b(top|classement|classe|trie|range)\b",

                normalized_question,

            )

        ):

            order = "DESC"

        negation = bool(

            NEGATIONS & set(norms)

        )

        yes_no = bool(

            re.search(

                r"\b(est|sont)-(il|elle|ils|elles|ce)\b"

                r"|\best-ce\b"

                r"|\bpeut-on\b",

                doc.text.lower(),

            )

        )

        return {

            "numbers": numbers,

            "order": order,

            "limit": limit,

            "negation": negation,

            "yes_no": yes_no,

        }

    # ========================================================
    # 11. REQUIRED ENTITIES
    # ========================================================
    @staticmethod

    def has_required(

        intent: str,

        entities: list[dict],

    ) -> bool:

        kind, needed = REQUIRED.get(

            intent,

            ("FOOD", 0),

        )

        unique_entities = {

            entity["id"]

            for entity in entities

            if entity["type"] == kind

        }

        return len(unique_entities) >= needed

    # ========================================================
    # 12. FULL ANALYSIS
    # ========================================================
    def analyse(self, question: str) -> dict:

        """Analyze the question and return a structured result."""

        question = question.strip()

        if not question:

            raise ValueError(

                "La question ne peut pas être vide."

            )

        doc = self.parse(question)

        entities = self.entities(doc)

        masked = self.masked(

            doc,

            entities,

        )

        probabilities = self.classifier.predict_proba(

            [masked]

        )[0]

        ranking = sorted(

            zip(

                map(str, self.classifier.classes_),

                map(float, probabilities),

            ),

            key=lambda item: -item[1],

        )

        top = [

            {

                "intent": intent,

                "probability": round(probability, 3),

            }

            for intent, probability in ranking[:3]

        ]

        in_domain = bool(

            entities

            or DOMAIN_WORDS.intersection(

                token.norm_

                for token in doc

            )

        )

        intent = None

        if in_domain and (

            entities or ranking[0][1] >= 0.35

        ):

            intent = next(

                (

                    candidate

                    for candidate, probability in ranking[:3]

                    if (

                        self.has_required(

                            candidate,

                            entities,

                        )

                        and (

                            candidate == ranking[0][0]

                            or probability >= 0.2

                        )

                    )

                ),

                None,

            )

        # Explicit ranking phrases with a number
        # should use ranking rather than extreme.
        slots = self.slots(

            doc,

            entities,

        )

        if (

            slots["limit"] is not None

            and intent == "extreme"

        ):

            intent = "ranking"

        # Preserve the existing response contract.
        confidence = (

            dict(ranking).get(intent, ranking[0][1])

        )

        return {

            "tokens": [

                {

                    "text": token.text,

                    "lemma": token.lemma_,

                    "pos": token.pos_,

                }

                for token in doc

                if not token.is_space

            ],

            "entities": entities,

            "masked": masked,

            "intent": intent,

            "confidence": round(confidence, 3),

            "top_intents": top,

            "slots": slots,

            "tools": TOOLS,

        }
