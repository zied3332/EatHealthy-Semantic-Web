
"""
Fuseki service.

Handles communication between the EatHealthy FastAPI
backend and the Apache Jena Fuseki SPARQL endpoint.
"""

import os

import httpx
from fastapi import HTTPException


FUSEKI_ENDPOINT = os.getenv(
    "FUSEKI_ENDPOINT",
    "http://localhost:3030/eathealthy/query",
)
FUSEKI_UPDATE_ENDPOINT = os.getenv(
    "FUSEKI_UPDATE_ENDPOINT",
    "http://localhost:3030/eathealthy/update",
)


async def execute_sparql(query: str) -> list[dict]:
    """
    Execute a SPARQL SELECT query against Fuseki.

    Args:
        query: The SPARQL query to execute.

    Returns:
        A list of SPARQL JSON result bindings.

    Raises:
        HTTPException: If Fuseki cannot process the request.
    """

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                FUSEKI_ENDPOINT,
                data={"query": query},
                headers={
                    "Accept": "application/sparql-results+json"
                },
            )

            response.raise_for_status()

        result = response.json()

        return result["results"]["bindings"]

    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(
            status_code=502,
            detail="Unable to retrieve data from Fuseki",
        ) from exc


async def execute_sparql_update(query: str) -> None:
    """Execute a SPARQL Update request against Fuseki."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                FUSEKI_UPDATE_ENDPOINT,
                data={"update": query},
                headers={"Accept": "application/json"},
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail="Unable to update data in Fuseki",
        ) from exc
