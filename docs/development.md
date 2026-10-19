# Development Setup

## Backend

Activate the Python virtual environment and start FastAPI:

python -m uvicorn backend.main:app --reload --port 8000

## Frontend

cd frontend
npm install
npm run dev

## Semantic Database

Start Apache Jena Fuseki and load the EatHealthy RDF ontology
into the eathealthy dataset.

SPARQL endpoint:
http://localhost:3030/eathealthy/query
