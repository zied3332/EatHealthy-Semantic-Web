
"""
EatHealthy NLP Service.

French natural-language understanding using spaCy.

Features:
- Tokenization and lemmatization
- Dietary regime recognition
- Health objective recognition
- Synonym detection
- Negation safeguards
- Combined diet and goal queries

No LLM API is used.
"""

import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache

import spacy


@dataclass(frozen=True)
class NLPAnalysis:
    intent: str
    entity: str
    label: str
    secondary_entity: str | None = None
    secondary_label: str | None = None


@lru_cache(maxsize=1)
def get_nlp():
    return spacy.load("fr_core_news_sm")


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)

    text = "".join(
        char
        for char in text
        if not unicodedata.combining(char)
    )

    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)

    return re.sub(r"\s+", " ", text).strip()


DIET_PATTERNS = {
    "RegimeVegetarien1": {
        "label": "Régime végétarien",
        "patterns": [
            "vegetarien",
            "vegetarienne",
            "vegetariens",
            "vegetariennes",
        ],
    },
    "RegimeVegan1": {
        "label": "Régime végan",
        "patterns": [
            "vegan",
            "vegane",
            "vegans",
            "vegetalien",
            "vegetalienne",
        ],
    },
    "RegimeOmnivore1": {
        "label": "Régime omnivore",
        "patterns": [
            "omnivore",
            "omnivores",
        ],
    },
    "RestrictionSansGluten1": {
        "label": "Sans gluten",
        "patterns": [
            "sans gluten",
            "gluten free",
        ],
    },
}


GOAL_PATTERNS = {
    "ObjectifPriseMasse1": {
        "label": "Prise de masse",
        "patterns": [
            "prise de masse",
            "prendre de la masse",
            "gagner du muscle",
            "prise de muscle",
            "developper ses muscles",
            "augmenter sa masse musculaire",
        ],
    },
    "ObjectifPertePoids1": {
        "label": "Perte de poids",
        "patterns": [
            "perte de poids",
            "perdre du poids",
            "maigrir",
            "mincir",
            "reduire son poids",
        ],
    },
    "ObjectifMaintienPoids1": {
        "label": "Maintien du poids",
        "patterns": [
            "maintien du poids",
            "maintenir son poids",
            "stabiliser son poids",
            "garder son poids",
        ],
    },
}


def find_concepts(
    text: str,
    vocabulary: dict,
) -> list[tuple[str, str]]:
    found = []

    for entity, config in vocabulary.items():
        for pattern in config["patterns"]:
            normalized_pattern = normalize(pattern)

            expression = (
                r"(?<!\w)"
                + re.escape(normalized_pattern)
                + r"(?!\w)"
            )

            if re.search(expression, text):
                found.append((entity, config["label"]))
                break

    return found


def analyze_question(question: str) -> NLPAnalysis:
    if not question.strip():
        raise ValueError(
            "La question ne peut pas être vide."
        )

    doc = get_nlp()(question)

    text = normalize(question)

    lemmas = " ".join(
        normalize(token.lemma_)
        for token in doc
        if not token.is_space and not token.is_punct
    )

    # --------------------------------------------------------
    # NEGATION SAFEGUARD
    # --------------------------------------------------------

    negative_patterns = [
        r"\bne\b.*?\bpas\b",
        r"\bn\b.*?\bpas\b",
        r"\bne\b.*?\bjamais\b",
        r"\bsauf\b",
        r"\bexclure\b",
    ]

    for pattern in negative_patterns:
        if re.search(pattern, text):
            raise ValueError(
                "Les questions négatives ne sont pas "
                "encore prises en charge."
            )

    # --------------------------------------------------------
    # RECOGNIZE CONCEPTS
    # --------------------------------------------------------

    diets = find_concepts(text, DIET_PATTERNS)
    goals = find_concepts(text, GOAL_PATTERNS)

    # Supplement with lemmatized text.
    if not diets:
        diets = find_concepts(lemmas, DIET_PATTERNS)

    if not goals:
        goals = find_concepts(lemmas, GOAL_PATTERNS)

    if len(diets) > 1 or len(goals) > 1:
        raise ValueError(
            "Plusieurs concepts similaires ont été détectés. "
            "Veuillez préciser votre question."
        )

    # --------------------------------------------------------
    # DETECT QUESTION SUBJECT
    # --------------------------------------------------------

    person_words = {
        "qui",
        "personne",
        "personnes",
        "utilisateur",
        "utilisateurs",
        "patient",
        "patients",
        "membre",
        "membres",
    }

    tokens = set(text.split()) | set(lemmas.split())

    if not tokens.intersection(person_words):
        raise ValueError(
            "Veuillez poser une question sur les utilisateurs "
            "et leurs préférences de santé."
        )

    # --------------------------------------------------------
    # COMBINED QUERY
    # --------------------------------------------------------

    if diets and goals:
        diet_entity, diet_label = diets[0]
        goal_entity, goal_label = goals[0]

        return NLPAnalysis(
            intent="persons_by_diet_and_goal",
            entity=diet_entity,
            label=diet_label,
            secondary_entity=goal_entity,
            secondary_label=goal_label,
        )

    # --------------------------------------------------------
    # DIET QUERY
    # --------------------------------------------------------

    if diets:
        entity, label = diets[0]

        return NLPAnalysis(
            intent="persons_by_diet",
            entity=entity,
            label=label,
        )

    # --------------------------------------------------------
    # HEALTH GOAL QUERY
    # --------------------------------------------------------

    if goals:
        entity, label = goals[0]

        return NLPAnalysis(
            intent="persons_by_goal",
            entity=entity,
            label=label,
        )

    raise ValueError(
        "Question non reconnue. Essayez une question "
        "sur les régimes alimentaires ou les objectifs santé."
    )
