
"""
EatHealthy API - Main Application.

Initializes FastAPI, configures CORS,
and registers the application routers.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import foods, diets


app = FastAPI(
    title="EatHealthy API",
    description="Semantic nutrition API powered by Apache Jena Fuseki",
    version="0.1.0",
)


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


# Register application modules.
app.include_router(foods.router)
app.include_router(diets.router)


@app.get("/", tags=["General"])
def home():
    return {
        "message": "Welcome to EatHealthy API",
        "version": "0.1.0",
    }
