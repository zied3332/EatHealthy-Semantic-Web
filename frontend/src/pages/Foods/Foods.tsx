
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  Apple,
  ArrowDownAZ,
  ArrowRight,
  Database,
  LoaderCircle,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sprout,
  X,
} from "lucide-react";

import api from "../../services/api";
import "./Foods.css";

// ============================================================
// TYPES
// ============================================================

type Food = {
  id: string;
  name: string;
  category: string;
  description: string;
};

type ApiFood = Record<string, unknown>;

type SortOption =
  | "name-asc"
  | "name-desc"
  | "category";

// ============================================================
// DATA HELPERS
// ============================================================

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

function localName(value: string): string {
  const cleanValue = value.split("#").pop() ?? value;
  return cleanValue.split("/").pop() ?? cleanValue;
}

/**
 * Convert ontology identifiers into readable labels.
 *
 * Example:
 *   PainBlanc -> Pain Blanc
 *   RegimeVegetarien -> Regime Vegetarien
 */
function readableName(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/([a-zà-ÿ])([A-Z])/g, "$1 $2")
    .trim();
}

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
 * Supports the EatHealthy API response:
 *
 * {
 *   count: 7,
 *   foods: [...]
 * }
 *
 * Also supports arrays and SPARQL bindings.
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

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function Foods() {
  // Data
  const [foods, setFoods] = useState<Food[]>([]);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] =
    useState("All");

  // Sorting
  const [sortBy, setSortBy] =
    useState<SortOption>("name-asc");

  // API state
  const [loading, setLoading] = useState(true);
  const [error, setError] =
    useState<string | null>(null);

  // ==========================================================
  // LOAD FOODS
  // ==========================================================

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

  useEffect(() => {
    void loadFoods();
  }, []);

  // ==========================================================
  // CATEGORIES
  // ==========================================================

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
        .sort((a, b) =>
          a.localeCompare(b)
        ),
    ];
  }, [foods]);

  // ==========================================================
  // SEARCH + FILTER + SORT
  // ==========================================================

  const filteredFoods = useMemo(() => {
    const query = search.trim().toLowerCase();

    const result = foods.filter((food) => {
      const matchesSearch =
        food.name.toLowerCase().includes(query) ||
        readableName(food.name)
          .toLowerCase()
          .includes(query) ||
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

    result.sort((a, b) => {
      if (sortBy === "name-desc") {
        return b.name.localeCompare(a.name);
      }

      if (sortBy === "category") {
        return (
          a.category.localeCompare(b.category) ||
          a.name.localeCompare(b.name)
        );
      }

      return a.name.localeCompare(b.name);
    });

    return result;
  }, [
    foods,
    search,
    selectedCategory,
    sortBy,
  ]);

  // ==========================================================
  // FILTER HELPERS
  // ==========================================================

  const hasActiveFilters =
    search.trim() !== "" ||
    selectedCategory !== "All";

  function clearFilters() {
    setSearch("");
    setSelectedCategory("All");
  }

  function resetExplorer() {
    clearFilters();
    setSortBy("name-asc");
  }

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="foods-page">
      {/* HEADER */}

      <section className="foods-header">
        <div>
          <div className="foods-eyebrow">
            <Sprout size={16} />
            SEMANTIC FOOD EXPLORER
          </div>

          <h1>Explore Healthy Foods</h1>

          <p>
            Discover foods stored in the
            EatHealthy knowledge graph and
            explore semantic nutrition data.
          </p>
        </div>

        <div className="foods-header-icon">
          <Apple size={34} />
        </div>
      </section>

      {/* SEARCH + REFRESH */}

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

      {/* FILTERS */}

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
                      : readableName(category)}
                  </span>

                  <span className="foods-category-count">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* SORTING */}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px",
              marginTop: "20px",
            }}
          >
            <label
              htmlFor="foods-sort"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontWeight: 600,
              }}
            >
              <ArrowDownAZ size={18} />
              Sort foods
            </label>

            <select
              id="foods-sort"
              value={sortBy}
              onChange={(event) =>
                setSortBy(
                  event.target.value as SortOption
                )
              }
              style={{
                padding: "10px 14px",
                borderRadius: "12px",
                border: "1px solid #d4dfd5",
                background: "#fff",
                color: "#263d2e",
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              <option value="name-asc">
                Name: A to Z
              </option>

              <option value="name-desc">
                Name: Z to A
              </option>

              <option value="category">
                Category
              </option>
            </select>
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

        {!loading && !error && (
          <span>
            {selectedCategory === "All"
              ? "All categories"
              : readableName(selectedCategory)}
          </span>
        )}

        <span className="foods-source">
          Source: EatHealthy Ontology
        </span>
      </div>

      {/* LOADING */}

      {loading && (
        <div
          className="foods-state"
          role="status"
        >
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

      {/* ERROR */}

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
                onClick={resetExplorer}
              >
                Reset Explorer
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
                to={`/foods/${encodeURIComponent(
                  food.name
                )}`}
                className="food-card"
                key={food.id}
                aria-label={`View details for ${
                  readableName(food.name)
                }`}
              >
                <div className="food-card-top">
                  <div className="food-card-icon">
                    <Apple size={25} />
                  </div>

                  <span className="food-card-category">
                    {readableName(food.category)}
                  </span>
                </div>

                <h2>{readableName(food.name)}</h2>

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
