
"""
EatHealthy API - Main Application.

Initializes FastAPI, configures CORS,
and registers the application routers.

Modules:
    - Foods: Food discovery and nutritional information.
    - Diets: Dietary regimes from the OWL ontology.
    - Profile: User profiles, health goals, and activity profiles.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import foods, diets, profile


# ============================================================
# FASTAPI APPLICATION
# ============================================================

app = FastAPI(
    title="EatHealthy API",
    description="Semantic nutrition API powered by Apache Jena Fuseki",
    version="0.1.0",
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
    allow_methods=["GET"],
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
        "version": "0.1.0",
    }
