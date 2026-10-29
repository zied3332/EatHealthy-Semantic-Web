# Gestion des nutriments — Nour

## Préremplissage Claude

Dans « Ajouter un nutriment », saisir un nom puis « Compléter avec l'IA ».
POST `/api/nutrients/suggest` est réservé aux administrateurs et ne modifie pas Fuseki.
Claude conserve le nom saisi, propose la catégorie et les aliments parmi ceux de la base.
Si le catalogue contient déjà ce nutriment, le formulaire ouvre sa modification
avec ses valeurs réellement enregistrées. Les valeurs absentes sont recherchées
avec le Web search Anthropic, limité aux domaines USDA, ANSES et MyFoodData.
Seules les valeurs dont l'URL a réellement été retournée par la recherche sont
acceptées. Unités, base de 100 g, préparation et URL sont affichées et enregistrées
dans Fuseki (eh:sourcesNutritionnelles). La proposition reste à vérifier par l'admin.
Une valeur introuvable reste vide, et n'est pas remplacée par zéro.
Les fibres ont une catégorie Fibre, sous-classe OWL de Glucide. Recréer les fibres
après suppression restaure la propriété aFibres des fiches aliments.
La proposition doit être relue et enregistrée explicitement par l'administrateur.
Le backend utilise ANTHROPIC_API_KEY et ANTHROPIC_MODEL dans backend/.env,
ignoré par Git. Ne jamais mettre la clé dans une variable VITE_*.
La connexion utilise l'API Messages d'Anthropic avec HTTPX, une recherche limitée
à cinq appels et, si nécessaire, une extraction structurée dans un second appel.
Les erreurs de connexion, de clé, de quota ou de JSON sont affichées sans secret.

Le catalogue fusionne désormais les associations explicites et les propriétés
nutritionnelles des aliments (protéines, glucides, lipides, fibres, sucres, sodium).
Les valeurs sont lues directement, sans données copiées ni migration Fuseki.
Les calories restent une mesure d'énergie hors catalogue des nutriments.
Les administrateurs peuvent modifier et supprimer toutes les entrées, y compris
celles issues de la composition. Le formulaire inclut les valeurs par aliment.
La modification remplace les propriétés numériques correspondantes dans Fuseki,
et la suppression globale retire ces valeurs ainsi que les associations.
Les nouveaux nutriments utilisent une propriété de teneur propre, référencée par
eh:proprieteNutritionnelle. Aucun chiffre nutritionnel n'est fourni par le frontend.
Le corps POST/PUT accepte `amounts`, par exemple `{"Banane": [1.1]}` ; les clés
doivent figurer dans `foods`, les valeurs doivent être finies et positives ou nulles.
Un tableau vide signifie quantité inconnue. Le zéro est conservé.

## Pages

- `/nutrients` : catalogue, recherche, filtre par type et aliment.
- `/foods/:foodName/nutrients` : nutriments d'un aliment, accessible depuis sa fiche.
- Cette page affiche d'abord les sept valeurs nutritionnelles de la fiche aliment,
  puis les associations explicites du catalogue. Une valeur manquante est indiquée
  « Non renseigné ». Les unités et portions ne sont pas inventées.
- Les noms des individus historiques sans label utilisent un nom lisible (Glucides,
  Protéines) ; leurs identifiants RDF sont conservés.
- Formulaire intégré : création, modification et sélection des aliments associés.

Les clients consultent ; les administrateurs créent, modifient et suppriment,
comme pour le module aliments. Le rôle est contrôlé dans l'API.

## Modèle

Classes existantes : Proteine, Glucide, Lipide, Vitamine, Mineral, sous-classes de Nutriment.
Le nom est un rdfs:label français. Les nouveaux identifiants utilisent un UUID.
Les associations utilisent contientNutriment ; les lectures reconnaissent aussi
estNutrimentDe. Une modification remplace les associations dans les deux directions.
Décocher un aliment retire son lien. Supprimer un nutriment retire ses liens entrants
et sortants, sans supprimer les aliments ni leurs valeurs aProteines/aGlucides/etc.
Le formulaire ne prétend pas gérer les quantités ou unités non modélisées ici.
Aucun import ni nouveau schéma OWL n'est nécessaire.

## API

- GET `/api/nutrients` et `?food=Lentilles`.
- GET `/api/nutrients/{id}`.
- GET `/api/nutrients/food/{id}/nutrition` : valeurs actuelles du même graphe que la
  fiche aliment et associations explicites, sans copie ni synchronisation différée.
- POST `/api/nutrients` : `{ "name": "Fer", "type": "Mineral", "foods": ["Lentilles"] }`.
- PUT `/api/nutrients/{id}` : même corps complet, remplace nom, type et associations.
- DELETE `/api/nutrients/{id}`.

## Vérifications

```bat
.venv\Scripts\python.exe -m pytest backend/tests -q
.venv\Scripts\python.exe -m backend.scripts.check_nutrients
```

La seconde commande nécessite Java et Fuseki. Elle vérifie la cohérence OWL,
pas la véracité nutritionnelle des données ; HermiT n'est pas exécuté à chaque écriture.

Test manuel administrateur : ajouter « Fer test » (Mineral), cocher Lentilles,
actualiser, filtrer sur Lentilles, modifier en cochant Brocoli à la place,
puis supprimer le nutriment de test. Vérifier que les aliments existent toujours.
Test client : consultation possible, boutons de gestion absents, écritures API refusées.
