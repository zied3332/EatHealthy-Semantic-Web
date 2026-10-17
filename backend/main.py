
"""
EatHealthy API - Main Application.

This module initializes the FastAPI application
and registers all API routers.
"""

from fastapi import FastAPI

from backend.routers import foods, diets


# Initialize FastAPI application
app = FastAPI(
    title="EatHealthy API",
    description="Semantic nutrition API powered by Apache Jena Fuseki",
    version="0.1.0",
)


# Register API routers
app.include_router(foods.router)
app.include_router(diets.router)


@app.get("/", tags=["General"])
def home():
    """
    API welcome endpoint.
    """
    return {
        "message": "Welcome to EatHealthy API",
        "version": "0.1.0",
    }
