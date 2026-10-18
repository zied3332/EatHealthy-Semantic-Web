
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  Apple,
  ArrowRight,
  Database,
  LoaderCircle,
  RefreshCw,
  Search,
  Sprout,
  SlidersHorizontal,
  X,
} from "lucide-react";

import api from "../../services/api";
import "./Foods.css";

/**
 * Normalized food object used by the frontend.
 */
type Food = {
  id: string;
  name: string;
  category: string;
  description: string;
};

type ApiFood = Record<string, unknown>;

/**
 * Read a value from a regular JSON field
 * or a SPARQL binding object.
 */
function readValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (
    value &&
    typeof value === "object" &&
    "value" in value
  ) {
    return readValue(
      (value as { value: unknown }).value
    );
  }

  return "";
}

/**
 * Extract the local name from an RDF URI.
 */
function localName(value: string): string {
  const cleanValue = value.split("#").pop() ?? value;
  return cleanValue.split("/").pop() ?? cleanValue;
}

/**
 * Convert a backend food object into
 * the format expected by React.
 */
function normalizeFood(
  item: ApiFood,
  index: number
): Food {
  const rawName = readValue(
    item.name ??
      item.label ??
      item.food ??
      item.aliment ??
      item.uri
  );

  const name =
    localName(rawName) || `Food ${index + 1}`;

  return {
    id:
      readValue(item.id ?? item.uri) ||
      `${name}-${index}`,

    name,

    category:
      localName(
        readValue(
          item.category ??
            item.type ??
            item.foodType
        )
      ) || "Food",

    description:
      readValue(item.description) ||
      "Explore this food in the EatHealthy knowledge graph.",
  };
}

/**
 * Support the EatHealthy API response:
 *
 * {
 *   count: 7,
 *   foods: [...]
 * }
 *
 * Also supports simple arrays and
 * SPARQL-style results.
 */
function extractFoods(data: unknown): Food[] {
  let items: unknown = data;

  if (
    data &&
    typeof data === "object" &&
    !Array.isArray(data)
  ) {
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
      items = (
        response.results as {
          bindings: unknown;
        }
      ).bindings;
    }
  }

  if (!Array.isArray(items)) {
    throw new Error(
      "Unexpected API response format."
    );
  }

  return items
    .filter(
      (item): item is ApiFood =>
        item !== null &&
        typeof item === "object" &&
        !Array.isArray(item)
    )
    .map(normalizeFood);
}

/**
 * Main Food Explorer page.
 */
export default function Foods() {
  // Data
  const [foods, setFoods] = useState<Food[]>([]);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] =
    useState("All");

  // API state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(
    null
  );

  /**
   * Fetch foods from FastAPI.
   */
  async function loadFoods() {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get("/api/foods");

      const normalizedFoods = extractFoods(
        response.data
      );

      setFoods(normalizedFoods);
    } catch (err) {
      console.error(
        "Failed to fetch foods:",
        err
      );

      setError(
        "Unable to load foods. Check that FastAPI and Apache Jena Fuseki are running."
      );
    } finally {
      setLoading(false);
    }
  }

  /**
   * Load ontology foods when the page mounts.
   */
  useEffect(() => {
    void loadFoods();
  }, []);

  /**
   * Dynamically generate categories from
   * the food data returned by the API.
   */
  const categories = useMemo(() => {
    const uniqueCategories = [
      ...new Set(
        foods.map((food) => food.category)
      ),
    ];

    return [
      "All",
      ...uniqueCategories
        .filter((category) => category !== "All")
        .sort(),
    ];
  }, [foods]);

  /**
   * Apply search and category filters together.
   */
  const filteredFoods = useMemo(() => {
    const query = search.trim().toLowerCase();

    return foods.filter((food) => {
      const matchesSearch =
        food.name.toLowerCase().includes(query) ||
        food.category
          .toLowerCase()
          .includes(query) ||
        food.description
          .toLowerCase()
          .includes(query);

      const matchesCategory =
        selectedCategory === "All" ||
        food.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [foods, search, selectedCategory]);

  /**
   * Check whether filters are active.
   */
  const hasActiveFilters =
    search.trim() !== "" ||
    selectedCategory !== "All";

  /**
   * Reset search and category filters.
   */
  function clearFilters() {
    setSearch("");
    setSelectedCategory("All");
  }

  return (
    <div className="foods-page">
      {/* PAGE HEADER */}

      <section className="foods-header">
        <div>
          <div className="foods-eyebrow">
            <Sprout size={16} />
            SEMANTIC FOOD EXPLORER
          </div>

          <h1>Explore Healthy Foods</h1>

          <p>
            Discover foods stored in the EatHealthy
            knowledge graph and explore semantic
            nutrition data.
          </p>
        </div>

        <div className="foods-header-icon">
          <Apple size={34} />
        </div>
      </section>

      {/* SEARCH AND REFRESH */}

      <div className="foods-toolbar">
        <div className="foods-search">
          <Search size={19} />

          <input
            type="search"
            placeholder="Search foods or categories..."
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            aria-label="Search foods"
          />

          {search && (
            <button
              type="button"
              className="foods-search-clear"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              <X size={17} />
            </button>
          )}
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

      {/* CATEGORY FILTERS */}

      {!loading && !error && (
        <section className="foods-filter-section">
          <div className="foods-filter-heading">
            <div className="foods-filter-title">
              <SlidersHorizontal size={17} />
              <span>Filter by category</span>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                className="foods-clear-filters"
                onClick={clearFilters}
              >
                <X size={15} />
                Clear filters
              </button>
            )}
          </div>

          <div
            className="foods-categories"
            role="group"
            aria-label="Food categories"
          >
            {categories.map((category) => {
              const count =
                category === "All"
                  ? foods.length
                  : foods.filter(
                      (food) =>
                        food.category === category
                    ).length;

              return (
                <button
                  key={category}
                  type="button"
                  className={`foods-category-btn ${
                    selectedCategory === category
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    setSelectedCategory(category)
                  }
                  aria-pressed={
                    selectedCategory === category
                  }
                >
                  <span>
                    {category === "All"
                      ? "All Foods"
                      : category}
                  </span>

                  <span className="foods-category-count">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* RESULTS SUMMARY */}

      <div className="foods-summary">
        <Database size={17} />

        <span>
          {loading
            ? "Loading semantic data..."
            : error
              ? "Data unavailable"
              : `${filteredFoods.length} of ${foods.length} foods`}
        </span>

        <span className="foods-source">
          Source: EatHealthy Ontology
        </span>
      </div>

      {/* LOADING STATE */}

      {loading && (
        <div className="foods-state" role="status">
          <LoaderCircle
            className="foods-spinner"
            size={32}
          />

          <h2>Loading foods</h2>

          <p>
            Retrieving data from the knowledge
            graph...
          </p>
        </div>
      )}

      {/* ERROR STATE */}

      {!loading && error && (
        <div
          className="foods-state foods-error"
          role="alert"
        >
          <h2>Connection error</h2>

          <p>{error}</p>

          <button
            type="button"
            onClick={() => void loadFoods()}
          >
            Try Again
          </button>
        </div>
      )}

      {/* EMPTY STATE */}

      {!loading &&
        !error &&
        filteredFoods.length === 0 && (
          <div className="foods-state">
            <Search size={30} />

            <h2>No foods found</h2>

            <p>
              {foods.length === 0
                ? "No foods were returned by the ontology."
                : "No foods match your selected filters."}
            </p>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
              >
                Clear Filters
              </button>
            )}
          </div>
        )}

      {/* FOOD CARDS */}

      {!loading &&
        !error &&
        filteredFoods.length > 0 && (
          <div className="foods-grid">
            {filteredFoods.map((food) => (
              <Link
                to={`/foods/${encodeURIComponent(food.name)}`}
                className="food-card"
                key={food.id}
                aria-label={`View details for ${food.name}`}
              >
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
              </Link>
            ))}
          </div>
        )}
    </div>
  );
}
