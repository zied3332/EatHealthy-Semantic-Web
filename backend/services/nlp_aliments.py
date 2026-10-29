"""NLP/TALN analysis of a food question, with no LLM: spaCy, PhraseMatcher, difflib, TF-IDF + logistic regression."""

import json
import random
import re
import unicodedata
from difflib import get_close_matches
from pathlib import Path

import spacy
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold, cross_val_score
from sklearn.pipeline import make_pipeline, make_union
from spacy.matcher import PhraseMatcher
from spacy.util import filter_spans

SPACY_MODEL = "fr_core_news_sm"
INTENTS_FILE = Path(__file__).resolve().parents[1] / "nlp_data" / "intents_aliments.json"
TOOLS = ["spaCy fr_core_news_sm", "scikit-learn TF-IDF + LogisticRegression", "difflib", "rdflib"]

# Entity type -> token of the delexicalized text.
MASKS = {"FOOD": "ent_food", "CATEGORY": "ent_cat", "IMPACT": "ent_impact",
         "ATTRIBUTE": "ent_attr", "DIET": "ent_diet", "LEVEL": "ent_level", "MEAL": "ent_meal"}

# Fixed vocabulary (the foods and the meal names come from Fuseki): (text, type, ontology ID or level).
VOCABULARY = [
    ("fruit", "CATEGORY", "Fruit"), ("légume", "CATEGORY", "Legume"), ("céréale", "CATEGORY", "Cereale"),
    ("viande", "CATEGORY", "Viande"), ("poisson", "CATEGORY", "Poisson"),
    ("produit laitier", "CATEGORY", "ProduitLaitier"), ("produits laitiers", "CATEGORY", "ProduitLaitier"),
    ("laitage", "CATEGORY", "ProduitLaitier"),
    ("carbone", "IMPACT", "EmpreinteCarbone"), ("co2", "IMPACT", "EmpreinteCarbone"),
    ("émission", "IMPACT", "EmpreinteCarbone"), ("polluer", "IMPACT", "EmpreinteCarbone"),
    ("polluant", "IMPACT", "EmpreinteCarbone"), ("pollution", "IMPACT", "EmpreinteCarbone"),
    ("gaz à effet de serre", "IMPACT", "EmpreinteCarbone"), ("climat", "IMPACT", "EmpreinteCarbone"),
    ("eau", "IMPACT", "EmpreinteEau"), ("litre", "IMPACT", "EmpreinteEau"), ("water", "IMPACT", "EmpreinteEau"),
    ("calorie", "ATTRIBUTE", "aCalories"), ("kcal", "ATTRIBUTE", "aCalories"), ("énergie", "ATTRIBUTE", "aCalories"),
    ("calorique", "ATTRIBUTE", "aCalories"), ("prix", "ATTRIBUTE", "prixMoyen"), ("coûter", "ATTRIBUTE", "prixMoyen"),
    ("cher", "ATTRIBUTE", "prixMoyen"), ("euro", "ATTRIBUTE", "prixMoyen"), ("price", "ATTRIBUTE", "prixMoyen"),
    ("bio", "ATTRIBUTE", "estBio"), ("biologique", "ATTRIBUTE", "estBio"), ("organic", "ATTRIBUTE", "estBio"),
    ("local", "ATTRIBUTE", "estLocal"), ("localement", "ATTRIBUTE", "estLocal"),
    ("végan", "DIET", "Vegan"), ("vegan", "DIET", "Vegan"), ("végétalien", "DIET", "Vegan"),
    ("végétarien", "DIET", "Vegetarien"), ("omnivore", "DIET", "Omnivore"),
    ("faible", "LEVEL", "low"), ("bas", "LEVEL", "low"), ("fort", "LEVEL", "high"), ("élevé", "LEVEL", "high"),
    ("durable", "LEVEL", "sustainable"), ("écologique", "LEVEL", "sustainable"), ("sustainable", "LEVEL", "sustainable"),
    ("glucide", "ATTRIBUTE", "aGlucides"), ("carb", "ATTRIBUTE", "aGlucides"), ("carbs", "ATTRIBUTE", "aGlucides"),
    ("protéine", "ATTRIBUTE", "aProteines"), ("lipide", "ATTRIBUTE", "aLipides"), ("graisse", "ATTRIBUTE", "aLipides"),
    ("fibre", "ATTRIBUTE", "aFibres"), ("sucre", "ATTRIBUTE", "aSucre"), ("sodium", "ATTRIBUTE", "aSodium"),
    ("sel", "ATTRIBUTE", "aSodium"),
    ("repas", "MEAL", "Repas"), ("meal", "MEAL", "Repas"), ("petit-déjeuner", "MEAL", "PetitDejeuner"),
    ("petit déjeuner", "MEAL", "PetitDejeuner"), ("breakfast", "MEAL", "PetitDejeuner"),
    ("déjeuner", "MEAL", "Dejeuner"), ("lunch", "MEAL", "Dejeuner"), ("dîner", "MEAL", "Diner"),
    ("dinner", "MEAL", "Diner"), ("collation", "MEAL", "Collation"), ("goûter", "MEAL", "Collation"),
    ("snack", "MEAL", "Collation"),
]
# Values used for the placeholders of the training phrases (they are masked again, so the names don't matter).
EXAMPLE_FOODS = ["pomme", "banane", "brocoli", "lentilles", "pain blanc", "poulet", "saumon", "bœuf", "fromage", "lait"]
EXAMPLES = {"{CAT}": ["fruits", "légumes", "céréales", "viandes", "poissons", "produits laitiers"],
            "{IMPACT}": ["carbone", "CO2", "eau", "émissions"], "{ATTR}": ["calories", "kcal", "prix", "glucides", "protéines"],
            "{DIET}": ["végans", "végétariens", "omnivores"], "{NUM}": ["2", "10", "50", "100", "300"],
            "{MEAL}": ["déjeuner", "dîner", "petit-déjeuner", "collation", "repas"]}

DOMAIN_WORDS = {"aliment", "nourriture", "manger", "produit", "plat", "food"}
# intent -> (entity type, how many are needed)
REQUIRED = {"value": ("FOOD", 1), "yes_no": ("FOOD", 1), "details": ("FOOD", 1), "compare": ("FOOD", 2),
            "meal_total": ("MEAL", 1), "meal_foods": ("MEAL", 1)}
NUMERIC = {"EmpreinteCarbone", "EmpreinteEau", "aCalories", "prixMoyen",
           "aGlucides", "aProteines", "aLipides", "aFibres", "aSucre", "aSodium"}
LESS = {"moins", "inferieur", "sous", "max", "maximum"}
MORE = {"plus", "superieur", "depasser", "min", "minimum"}
SMALL = {"petit", "faible", "bas"}
NEGATIONS = {"pas", "non", "sans", "ne"}
NUMBER = r"\d+([.,]\d+)?"


def normalize(text: str) -> str:
    """Lowercase, œ -> oe, no accents."""
    text = text.lower().replace("œ", "oe")
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")


class NlpAliments:
    """Question -> tokens, entities, delexicalized text, intent and slots."""

    def __init__(self):
        self.nlp = spacy.load(SPACY_MODEL, disable=["parser", "ner"])
        self.foods: list[tuple[str, str]] = []
        self.set_vocabulary([(f, f) for f in EXAMPLE_FOODS])   # only to read the training phrases
        self.texts, self.labels, self.groups = self.training_set()
        self.classifier = make_pipeline(
            make_union(TfidfVectorizer(analyzer="word", ngram_range=(1, 2), sublinear_tf=True),
                       TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), sublinear_tf=True)),
            LogisticRegression(C=10, max_iter=3000))
        self.classifier.fit(self.texts, self.labels)
        self.foods = []   # the real foods are loaded from Fuseki by set_vocabulary()

    # ---------------------------------------------------------------- 1. spaCy analysis
    def parse(self, text: str):
        """Tokens, lemmas and POS; token.norm_ = normalized lemma (the text for proper nouns)."""
        doc = self.nlp(text)
        for token in doc:
            token.norm_ = normalize(token.text if token.pos_ == "PROPN" else token.lemma_)
        return doc

    # ---------------------------------------------------------------- 2. entities (PhraseMatcher + difflib)
    def set_vocabulary(self, foods: list[tuple[str, str]], meals: list[tuple[str, str]] = ()) -> None:
        """Rebuild the PhraseMatcher with the fixed vocabulary, the foods and the meal names (label, ontology ID)."""
        self.foods = sorted(set(foods))
        self.matcher = PhraseMatcher(self.nlp.vocab, attr="NORM")
        self.single_words = {}   # normalized word -> matcher key, for typos
        terms = VOCABULARY + [(label, "FOOD", food_id) for label, food_id in self.foods] + \
            [(label, "MEAL", meal_id) for label, meal_id in sorted(set(meals))]
        for text, kind, ident in terms:
            key = f"{kind}|{ident}"
            variants = {text, text.lower(), text + "s", text[:-1] if text.endswith("s") else text}
            patterns = [self.parse(v) for v in variants]
            self.matcher.add(key, patterns)
            for p in patterns:
                if len(p) == 1 and len(p[0].norm_) >= 4:
                    self.single_words.setdefault(p[0].norm_, key)

    def entities(self, doc) -> list[dict]:
        spans = []
        for match_id, start, end in self.matcher(doc):
            spans.append(doc[start:end])
            spans[-1].label_ = self.nlp.vocab.strings[match_id]
        spans = filter_spans(spans)
        covered = {i for s in spans for i in range(s.start, s.end)}
        found = [(s, False) for s in spans]
        for token in doc:   # a word that matches nothing: maybe a typo ("pome" -> pomme)
            if token.i in covered or token.is_stop or len(token.norm_) < 4 or token.pos_ not in ("NOUN", "ADJ", "PROPN", "VERB", "X"):
                continue
            close = get_close_matches(token.norm_, self.single_words, n=1, cutoff=0.8) or \
                get_close_matches(normalize(token.text), self.single_words, n=1, cutoff=0.8)
            if close:
                span = doc[token.i:token.i + 1]
                span.label_ = self.single_words[close[0]]
                found.append((span, True))
        result = []
        for span, corrected in sorted(found, key=lambda x: x[0].start):
            kind, ident = span.label_.split("|", 1)
            if kind == "LEVEL" and span.start > 0 and doc[span.start - 1].norm_ in ("plus", "moins"):
                continue   # "la plus faible" is a superlative, not a level
            result.append({"text": span.text, "type": kind, "id": ident, "corrected": corrected,
                           "start": span.start, "end": span.end})
        return result

    # ---------------------------------------------------------------- 3. delexicalization
    @staticmethod
    def masked(doc, entities: list[dict]) -> str:
        """Each entity becomes its type token, each number becomes ent_num."""
        by_start = {e["start"]: e for e in entities}
        words, i = [], 0
        while i < len(doc):
            if i in by_start:
                words.append(MASKS[by_start[i]["type"]])
                i = by_start[i]["end"]
                continue
            if not doc[i].is_punct:
                words.append("ent_num" if re.fullmatch(NUMBER, doc[i].text) else doc[i].norm_)
            i += 1
        return " ".join(words)

    # ---------------------------------------------------------------- 4. intent classifier (scikit-learn)
    def training_set(self):
        """Training phrases with the placeholders filled (3 versions each), then delexicalized."""
        intents = json.loads(INTENTS_FILE.read_text(encoding="utf-8"))["intents"]
        rng = random.Random(42)
        texts, labels, groups = [], [], []
        for intent, phrases in intents.items():
            for n, phrase in enumerate(phrases):
                for _ in range(3 if "{" in phrase else 1):
                    food, food2 = rng.sample(EXAMPLE_FOODS, 2)
                    text = phrase.replace("{FOOD}", food).replace("{FOOD2}", food2)
                    for holder, values in EXAMPLES.items():
                        text = text.replace(holder, rng.choice(values))
                    doc = self.parse(text)
                    texts.append(self.masked(doc, self.entities(doc)))
                    labels.append(intent)
                    groups.append(f"{intent}#{n}")   # a phrase and its copies stay in the same fold
        return texts, labels, groups

    def cross_validation(self) -> float:
        """Grouped 5-fold accuracy of the classifier on the training phrases."""
        scores = cross_val_score(self.classifier, self.texts, self.labels, groups=self.groups, cv=GroupKFold(5))
        return float(scores.mean())

    # ---------------------------------------------------------------- 5. slots (rules on the lemmas)
    @staticmethod
    def slots(doc, entities: list[dict]) -> dict:
        norms = [t.norm_ for t in doc]
        measures = [e for e in entities if e["id"] in NUMERIC]
        numbers, limit, used = [], None, set()
        for t in doc:
            if not re.fullmatch(NUMBER, t.text):
                continue
            number = float(t.text.replace(",", "."))
            before = norms[max(0, t.i - 3):t.i]
            if before and before[-1] in ("top", "le", "les"):
                limit = int(number)
                continue
            op = "<" if LESS & set(before) else ">" if MORE & set(before) else None
            if op:
                used.update(range(max(0, t.i - 3), t.i))
                near = min(measures, key=lambda e: abs(e["start"] - t.i), default=None)
                numbers.append({"op": op, "value": number, "measure": near["id"] if near else "EmpreinteCarbone"})
        order = None
        for i, word in enumerate(norms):
            if i in used:
                continue
            if word in ("plus", "moins", "maximum", "minimum", "top", "croissant", "decroissant"):
                order = "ASC" if word in ("moins", "minimum", "croissant") else "DESC"
                if word in ("plus", "moins") and i + 1 < len(norms) and norms[i + 1] in SMALL:
                    order = "ASC"
                break
        return {"numbers": numbers, "order": order, "limit": limit,
                "negation": bool(NEGATIONS & set(norms)),
                "yes_no": bool(re.search(r"\b(est|sont)-(il|elle|ils|elles|ce)\b|\best-ce\b", doc.text.lower()))}

    # ---------------------------------------------------------------- 6. full analysis and intent choice
    @staticmethod
    def has_required(intent: str, entities: list[dict]) -> bool:
        kind, needed = REQUIRED.get(intent, ("FOOD", 0))
        return sum(e["type"] == kind for e in entities) >= needed

    def analyse(self, question: str) -> dict:
        doc = self.parse(question)
        entities = self.entities(doc)
        masked = self.masked(doc, entities)
        probabilities = zip(map(str, self.classifier.classes_), map(float, self.classifier.predict_proba([masked])[0]))
        ranking = sorted(probabilities, key=lambda x: -x[1])
        top = [{"intent": i, "probability": round(p, 3)} for i, p in ranking[:3]]
        in_domain = entities or DOMAIN_WORDS & {t.norm_ for t in doc}
        intent = None
        if in_domain and (entities or ranking[0][1] >= 0.35):
            # the most probable intent whose required entities are present
            intent = next((i for i, p in ranking[:3] if self.has_required(i, entities) and
                           (i == ranking[0][0] or p >= 0.2)), None)
        return {
            "tokens": [{"text": t.text, "lemma": t.lemma_, "pos": t.pos_} for t in doc if not t.is_space],
            "entities": entities,
            "masked": masked,
            "intent": intent,
            "confidence": round(dict(ranking)[intent or ranking[0][0]], 3),
            "top_intents": top,
            "slots": self.slots(doc, entities),
            "tools": TOOLS,
        }
