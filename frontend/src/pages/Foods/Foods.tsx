
import { useEffect, useMemo, useState } from "react";
import {
  Apple,
  ArrowRight,
  Database,
  LoaderCircle,
  RefreshCw,
  Search,
  Sprout,
} from "lucide-react";

import api from "../../services/api";
import "./Foods.css";

/**
 * Food data returned by the EatHealthy API.
 *
 * The normalization function below supports both
 * simple food objects and SPARQL-style bindings.
 */
type Food = {
  id: string;
  name: string;
  category: string;
  description: string;
};

type ApiFood = Record<string, unknown>;

function readValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (value && typeof value === "object" && "value" in value) {
    return readValue((value as { value: unknown }).value);
  }

  return "";
}

function localName(value: string): string {
  const cleanValue = value.split("#").pop() ?? value;
  return cleanValue.split("/").pop() ?? cleanValue;
}

function normalizeFood(item: ApiFood, index: number): Food {
  const rawName = readValue(
    item.name ?? item.label ?? item.food ?? item.aliment ?? item.uri
  );

  const name = localName(rawName) || `Food ${index + 1}`;

  return {
    id: readValue(item.id ?? item.uri) || `${name}-${index}`,
    name,
    category:
      localName(
        readValue(item.category ?? item.type ?? item.foodType)
      ) || "Food",
    description:
      readValue(item.description) ||
      "Explore this food in the EatHealthy knowledge graph.",
  };
}

function extractFoods(data: unknown): Food[] {
  let items: unknown = data;

  if (data && typeof data === "object" && !Array.isArray(data)) {
    const response = data as Record<string, unknown>;

    if (Array.isArray(response.foods)) {
      items = response.foods;
    } else if (Array.isArray(response.results)) {
      items = response.results;
    } else if (
      response.results &&
      typeof response.results === "object" &&
      "bindings" in response.results
    ) {
      items = (response.results as { bindings: unknown }).bindings;
    }
  }

  if (!Array.isArray(items)) {
    throw new Error("Unexpected API response format.");
  }

  return items
    .filter(
      (item): item is ApiFood =>
        item !== null && typeof item === "object"
    )
    .map(normalizeFood);
}

export default function Foods() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadFoods() {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get("/api/foods");
      setFoods(extractFoods(response.data));
    } catch (err) {
      console.error("Failed to fetch foods:", err);
      setError(
        "Unable to load foods. Check that FastAPI and Apache Jena Fuseki are running."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFoods();
  }, []);

  const filteredFoods = useMemo(() => {
    const query = search.trim().toLowerCase();

    return foods.filter(
      (food) =>
        food.name.toLowerCase().includes(query) ||
        food.category.toLowerCase().includes(query) ||
        food.description.toLowerCase().includes(query)
    );
  }, [foods, search]);

  return (
    <div className="foods-page">
      <div className="foods-header">
        <div>
          <div className="foods-eyebrow">
            <Sprout size={16} />
            SEMANTIC FOOD EXPLORER
          </div>

          <h1>Explore Healthy Foods</h1>

          <p>
            Discover foods stored in the EatHealthy knowledge
            graph and explore semantic nutrition data.
          </p>
        </div>

        <div className="foods-header-icon">
          <Apple size={34} />
        </div>
      </div>

      <div className="foods-toolbar">
        <div className="foods-search">
          <Search size={19} />
          <input
            type="search"
            placeholder="Search foods or categories..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search foods"
          />
        </div>

        <button
          type="button"
          className="foods-refresh"
          onClick={() => void loadFoods()}
          disabled={loading}
        >
          <RefreshCw size={17} />
          Refresh
        </button>
      </div>

      <div className="foods-summary">
        <Database size={17} />
        <span>
          {loading
            ? "Loading semantic data..."
            : `${filteredFoods.length} of ${foods.length} foods`}
        </span>
        <span className="foods-source">Source: EatHealthy Ontology</span>
      </div>

      {loading && (
        <div className="foods-state" role="status">
          <LoaderCircle className="foods-spinner" size={32} />
          <h2>Loading foods</h2>
          <p>Retrieving data from the knowledge graph...</p>
        </div>
      )}

      {!loading && error && (
        <div className="foods-state foods-error" role="alert">
          <h2>Connection error</h2>
          <p>{error}</p>
          <button type="button" onClick={() => void loadFoods()}>
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && filteredFoods.length === 0 && (
        <div className="foods-state">
          <Search size={30} />
          <h2>No foods found</h2>
          <p>
            {foods.length === 0
              ? "No foods were returned by the ontology."
              : "Try another search term."}
          </p>
        </div>
      )}

      {!loading && !error && filteredFoods.length > 0 && (
        <div className="foods-grid">
          {filteredFoods.map((food) => (
            <article className="food-card" key={food.id}>
              <div className="food-card-top">
                <div className="food-card-icon">
                  <Apple size={25} />
                </div>
                <span className="food-card-category">
                  {food.category}
                </span>
              </div>

              <h2>{food.name}</h2>
              <p>{food.description}</p>

              <div className="food-card-footer">
                <span>
                  <Database size={14} />
                  Knowledge Graph
                </span>
                <ArrowRight size={18} />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
