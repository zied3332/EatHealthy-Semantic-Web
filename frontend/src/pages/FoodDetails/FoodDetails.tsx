
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  CircleHelp,
  Database,
  Droplets,
  Flame,
  Leaf,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sprout,
  Wheat,
  XCircle,
} from "lucide-react";

import api from "../../services/api";
import "./FoodDetails.css";

// ============================================================
// TYPES
// ============================================================

interface FoodProperty {
  property: string;
  property_uri?: string;
  value: string;
  value_uri: string | null;
  value_type: string;
}

interface FoodDetailsResponse {
  name: string;
  uri: string;
  properties_count: number;
  properties: FoodProperty[];
}

interface NutritionField {
  key: string;
  label: string;
  unit: string;
  icon: typeof Flame;
  className: string;
}

// ============================================================
// NUTRITION CONFIGURATION
// ============================================================

const nutritionFields: NutritionField[] = [
  {
    key: "aCalories",
    label: "Calories",
    unit: "",
    icon: Flame,
    className: "calories",
  },
  {
    key: "aProteines",
    label: "Proteins",
    unit: "",
    icon: ShieldCheck,
    className: "proteins",
  },
  {
    key: "aGlucides",
    label: "Carbohydrates",
    unit: "",
    icon: Wheat,
    className: "carbs",
  },
  {
    key: "aLipides",
    label: "Fats",
    unit: "",
    icon: Droplets,
    className: "fats",
  },
  {
    key: "aFibres",
    label: "Fiber",
    unit: "",
    icon: Sprout,
    className: "fiber",
  },
  {
    key: "aSucre",
    label: "Sugar",
    unit: "",
    icon: Leaf,
    className: "sugar",
  },
  {
    key: "aSodium",
    label: "Sodium",
    unit: "",
    icon: Droplets,
    className: "sodium",
  },
];

// ============================================================
// HELPERS
// ============================================================

function getProperties(
  properties: FoodProperty[],
  propertyName: string
): FoodProperty[] {
  return properties.filter(
    (item) => item.property === propertyName
  );
}

function getFirstValue(
  properties: FoodProperty[],
  propertyName: string
): string | null {
  return getProperties(properties, propertyName)[0]?.value ?? null;
}

function getBooleanValue(
  properties: FoodProperty[],
  propertyName: string
): boolean | null {
  const value = getFirstValue(properties, propertyName);

  if (value === null) return null;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;

  return null;
}

function formatValue(value: string): string {
  const number = Number(value);

  if (value.trim() !== "" && Number.isFinite(number)) {
    return number.toLocaleString("en-US", {
      maximumFractionDigits: 3,
    });
  }

  return value;
}

function formatPropertyName(value: string): string {
  return value
    .replace(/^a(?=[A-Z])/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}

// ============================================================
// COMPONENT
// ============================================================

export default function FoodDetails() {
  const { foodName } = useParams<{ foodName: string }>();

  const [food, setFood] = useState<FoodDetailsResponse | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // ----------------------------------------------------------
  // FETCH FOOD DETAILS
  // ----------------------------------------------------------

  useEffect(() => {
    let active = true;

    async function loadFood() {
      if (!foodName) {
        setFood(null);
        setError("No food identifier was provided.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setFood(null);

      try {
        const response = await api.get<FoodDetailsResponse>(
          `/api/foods/${encodeURIComponent(foodName)}`
        );

        if (active) {
          setFood(response.data);
        }
      } catch (err: unknown) {
        if (!active) return;

        let message =
          "Unable to load food details. Please try again.";

        if (
          typeof err === "object" &&
          err !== null &&
          "response" in err
        ) {
          const response = (
            err as {
              response?: {
                status?: number;
              };
            }
          ).response;

          if (response?.status === 404) {
            message =
              "This food was not found in the ontology.";
          }
        }

        setError(message);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadFood();

    return () => {
      active = false;
    };
  }, [foodName, reloadKey]);

  // ----------------------------------------------------------
  // DERIVED DATA
  // ----------------------------------------------------------

  const properties = food?.properties ?? [];

  const category = useMemo(() => {
    const types = getProperties(properties, "type");

    return (
      types.find((item) => item.value !== "NamedIndividual")
        ?.value ?? "Food"
    );
  }, [properties]);

  const nutrients = useMemo(
    () =>
      nutritionFields.map((field) => ({
        ...field,
        values: getProperties(properties, field.key),
      })),
    [properties]
  );

  const semanticRelations = useMemo(
    () =>
      properties.filter(
        (item) =>
          item.value_type === "uri" &&
          item.property !== "type"
      ),
    [properties]
  );

  const knownNutritionKeys = new Set(
    nutritionFields.map((field) => field.key)
  );

  const otherProperties = properties.filter(
    (item) =>
      !knownNutritionKeys.has(item.property) &&
      ![
        "type",
        "estBio",
        "estLocal",
        "scoreNutritionnel",
        "prixMoyen",
      ].includes(item.property) &&
      item.value_type !== "uri"
  );

  const organic = getBooleanValue(properties, "estBio");
  const local = getBooleanValue(properties, "estLocal");

  const nutritionScore = getFirstValue(
    properties,
    "scoreNutritionnel"
  );

  const averagePrice = getFirstValue(
    properties,
    "prixMoyen"
  );

  // ----------------------------------------------------------
  // LOADING
  // ----------------------------------------------------------

  if (loading) {
    return (
      <div className="food-details-page">
        <div className="food-details-state">
          <LoaderCircle className="food-details-spinner" size={36} />
          <h2>Loading food details</h2>
          <p>
            Retrieving semantic information from EatHealthy...
          </p>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------
  // ERROR
  // ----------------------------------------------------------

  if (error || !food) {
    return (
      <div className="food-details-page">
        <Link to="/foods" className="food-details-back">
          <ArrowLeft size={17} />
          Back to Food Explorer
        </Link>

        <div className="food-details-state">
          <CircleHelp size={40} />
          <h2>Food details unavailable</h2>
          <p>{error ?? "No data was returned."}</p>

          <button
            type="button"
            className="food-details-retry"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            <RefreshCw size={16} />
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------
  // PAGE
  // ----------------------------------------------------------

  return (
    <div className="food-details-page">
      <Link to="/foods" className="food-details-back">
        <ArrowLeft size={17} />
        Back to Food Explorer
      </Link>

      {/* HEADER */}

      <section className="food-details-hero">
        <div className="food-details-hero-main">
          <div className="food-details-hero-icon">
            <Leaf size={34} />
          </div>

          <div>
            <span className="food-details-eyebrow">
              EATHEALTHY FOOD EXPLORER
            </span>

            <h1>{food.name}</h1>

            <div className="food-details-hero-meta">
              <span className="food-details-category">
                <Sprout size={14} />
                {category}
              </span>

              <span className="food-details-source">
                <Database size={14} />
                Semantic ontology
              </span>
            </div>
          </div>
        </div>

        <div className="food-details-hero-stat">
          <strong>{food.properties_count}</strong>
          <span>RDF properties</span>
        </div>
      </section>

      {/* MAIN GRID */}

      <div className="food-details-layout">
        <div className="food-details-main">
          {/* NUTRITION */}

          <section className="food-details-panel">
            <div className="food-details-section-heading">
              <div>
                <span className="food-details-section-kicker">
                  NUTRITION
                </span>
                <h2>Nutritional information</h2>
                <p>
                  Values retrieved directly from the
                  EatHealthy ontology.
                </p>
              </div>
            </div>

            <div className="food-details-nutrition-grid">
              {nutrients.map((nutrient) => {
                const Icon = nutrient.icon;

                return (
                  <div
                    className={`food-details-nutrient ${nutrient.className}`}
                    key={nutrient.key}
                  >
                    <div className="food-details-nutrient-top">
                      <span className="food-details-nutrient-icon">
                        <Icon size={19} />
                      </span>
                      <span className="food-details-nutrient-label">
                        {nutrient.label}
                      </span>
                    </div>

                    <div className="food-details-nutrient-value">
                      {nutrient.values.length > 0 ? (
                        nutrient.values.map((item, index) => (
                          <span key={`${item.value}-${index}`}>
                            {formatValue(item.value)}
                            {nutrient.unit && (
                              <small>{nutrient.unit}</small>
                            )}
                          </span>
                        ))
                      ) : (
                        <span className="food-details-no-value">
                          Not available
                        </span>
                      )}
                    </div>

                    {nutrient.values.length > 1 && (
                      <span className="food-details-multiple-note">
                        Multiple values in ontology
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="food-details-data-note">
              Measurement units and serving sizes have not
              been confirmed in the ontology response.
              Multiple values are displayed separately.
            </p>
          </section>

          {/* SEMANTIC RELATIONSHIPS */}

          <section className="food-details-panel">
            <div className="food-details-section-heading">
              <div>
                <span className="food-details-section-kicker">
                  KNOWLEDGE GRAPH
                </span>
                <h2>Semantic relationships</h2>
                <p>
                  Connections between this food and other
                  ontology individuals.
                </p>
              </div>

              <Database size={21} />
            </div>

            {semanticRelations.length > 0 ? (
              <div className="food-details-relations">
                {semanticRelations.map((relation, index) => (
                  <div
                    className="food-details-relation"
                    key={`${relation.property}-${relation.value}-${index}`}
                  >
                    <div className="food-details-relation-icon">
                      <Database size={18} />
                    </div>

                    <div className="food-details-relation-content">
                      <span>
                        {formatPropertyName(
                          relation.property
                        )}
                      </span>
                      <strong>{relation.value}</strong>
                    </div>

                    {relation.value_uri && (
                      <a
                        href={relation.value_uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="food-details-relation-link"
                        title="Open RDF resource URI"
                      >
                        <ArrowUpRight size={17} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="food-details-empty">
                No additional semantic relationships
                were found.
              </div>
            )}
          </section>

          {/* ADDITIONAL PROPERTIES */}

          {otherProperties.length > 0 && (
            <section className="food-details-panel">
              <div className="food-details-section-heading">
                <div>
                  <span className="food-details-section-kicker">
                    ONTOLOGY
                  </span>
                  <h2>Additional properties</h2>
                </div>
              </div>

              <div className="food-details-property-list">
                {otherProperties.map((property, index) => (
                  <div
                    className="food-details-property-row"
                    key={`${property.property}-${index}`}
                  >
                    <span>
                      {formatPropertyName(
                        property.property
                      )}
                    </span>
                    <strong>{property.value}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* SIDEBAR */}

        <aside className="food-details-sidebar">
          <section className="food-details-panel">
            <span className="food-details-section-kicker">
              FOOD PROFILE
            </span>

            <h2>Food attributes</h2>

            <div className="food-details-attributes">
              <div className="food-details-attribute">
                <span className="food-details-attribute-label">
                  Organic
                </span>

                <span
                  className={`food-details-status ${
                    organic === true
                      ? "positive"
                      : organic === false
                      ? "negative"
                      : "unknown"
                  }`}
                >
                  {organic === true ? (
                    <CheckCircle2 size={15} />
                  ) : organic === false ? (
                    <XCircle size={15} />
                  ) : (
                    <CircleHelp size={15} />
                  )}
                  {organic === null
                    ? "Unknown"
                    : organic
                    ? "Yes"
                    : "No"}
                </span>
              </div>

              <div className="food-details-attribute">
                <span className="food-details-attribute-label">
                  Locally sourced
                </span>

                <span
                  className={`food-details-status ${
                    local === true
                      ? "positive"
                      : local === false
                      ? "negative"
                      : "unknown"
                  }`}
                >
                  {local === true ? (
                    <CheckCircle2 size={15} />
                  ) : local === false ? (
                    <XCircle size={15} />
                  ) : (
                    <CircleHelp size={15} />
                  )}
                  {local === null
                    ? "Unknown"
                    : local
                    ? "Yes"
                    : "No"}
                </span>
              </div>

              <div className="food-details-attribute">
                <span className="food-details-attribute-label">
                  Nutrition score
                </span>

                <strong>
                  {nutritionScore
                    ? formatValue(nutritionScore)
                    : "Not available"}
                </strong>
              </div>

              <div className="food-details-attribute">
                <span className="food-details-attribute-label">
                  Average price
                </span>

                <strong>
                  {averagePrice
                    ? formatValue(averagePrice)
                    : "Not available"}
                </strong>
              </div>
            </div>

            <p className="food-details-sidebar-note">
              Scores and prices use values stored in
              the ontology. Their scales and currency
              have not been verified.
            </p>
          </section>

          <section className="food-details-panel food-details-rdf-panel">
            <div className="food-details-rdf-heading">
              <Database size={20} />
              <h2>RDF resource</h2>
            </div>

            <p>
              This food is represented as an individual
              in the EatHealthy knowledge graph.
            </p>

            <div className="food-details-uri">
              {food.uri}
            </div>

            <div className="food-details-rdf-count">
              <span>Properties returned</span>
              <strong>{food.properties_count}</strong>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
