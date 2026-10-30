
"""
EatHealthy API - Main Application.

Initializes FastAPI, configures CORS,
and registers the application routers.

Modules:
    - Foods: Food discovery and nutritional information.
    - Diets: Dietary regimes from the OWL ontology.
    - Profile: User profiles, health goals, and activity profiles.
    - Recommendations: Personalized food recommendations using SPARQL.
    - Users: Authentication and account management.
    - Health Preferences: Health objectives and dietary regimes CRUD.
    - NLP: Natural language to SPARQL translation using spaCy.
    - Impacts, Nutrients, Meals: Nutrition and environmental data.
"""

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


# ============================================================
# ENVIRONMENT CONFIGURATION
# ============================================================

# Load backend/.env before importing application routers.
load_dotenv(Path(__file__).resolve().parent / ".env")


# ============================================================
# IMPORT ROUTERS
# ============================================================

from backend.routers import (
    foods,
    diets,
    profile,
    recommendations,
    users,
    impacts,
    meals,
    nutrients,
    health_preferences,
    nlp,
)


# ============================================================
# FASTAPI APPLICATION
# ============================================================

app = FastAPI(
    title="EatHealthy API",
    description=(
        "Semantic nutrition and personalized food recommendation "
        "API powered by Apache Jena Fuseki and spaCy NLP"
    ),
    version="0.3.0",
)


# ============================================================
# CORS CONFIGURATION
# ============================================================

# Allow the React development frontend to access the API.
# Vite may use a different port when 5173 is occupied.

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=False,
    allow_methods=[
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ],
    allow_headers=["*"],
)


# ============================================================
# API ROUTERS
# ============================================================

# Food Explorer and Food Details.
app.include_router(foods.router)

# Dietary preferences and regimes.
app.include_router(diets.router)

# Semantic user profiles, goals, and activity profiles.
app.include_router(profile.router)

# Personalized food recommendations using SPARQL.
app.include_router(recommendations.router)

# Authentication and user management.
app.include_router(users.router)

# Environmental impacts, nutrients, and meals.
app.include_router(impacts.router)
app.include_router(nutrients.router)
app.include_router(meals.router)

# Health objectives and dietary regimes CRUD.
# Supports authenticated clients and administrators.
app.include_router(health_preferences.router)

# NLP: Natural language to SPARQL translation.
# Uses spaCy to analyze questions and Fuseki to execute queries.
app.include_router(nlp.router)


# ============================================================
# GENERAL ENDPOINTS
# ============================================================

@app.get("/", tags=["General"])
def home():
    """
    API health and welcome endpoint.

    Provides basic application information.
    """
    return {
        "message": "Welcome to EatHealthy API",
        "version": "0.3.0",
        "modules": [
            "foods",
            "diets",
            "profile",
            "recommendations",
            "users",
            "health_preferences",
            "nlp",
            "impacts",
            "nutrients",
            "meals",
        ],
    }
