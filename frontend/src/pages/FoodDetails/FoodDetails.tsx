
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

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
import { useAuth } from "../../context/AuthContext";
import { ADMIN_ONLY, co2Badge, deleteFood, errorMessage } from "../../services/aliments";
import type { FoodSummary } from "../../services/aliments";
import FoodForm from "../Foods/FoodForm";
import "../Foods/aliments.css";
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

interface FoodDetailsResponse extends Partial<FoodSummary> {
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

type SemanticGroup = {
  title: string;
  description: string;
  icon: typeof Leaf;
  relations: FoodProperty[];
};

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

/**
 * Return all properties with the specified RDF predicate.
 */
function getProperties(
  properties: FoodProperty[],
  propertyName: string
): FoodProperty[] {
  return properties.filter(
    (item) => item.property === propertyName
  );
}

/**
 * Return the first value of a property, if available.
 */
function getFirstValue(
  properties: FoodProperty[],
  propertyName: string
): string | null {
  return (
    getProperties(properties, propertyName)[0]?.value ??
    null
  );
}

/**
 * Parse RDF boolean literals without assuming
 * missing information means false.
 */
function getBooleanValue(
  properties: FoodProperty[],
  propertyName: string
): boolean | null {
  const value = getFirstValue(
    properties,
    propertyName
  );

  if (value === null) {
    return null;
  }

  if (value.toLowerCase() === "true") {
    return true;
  }

  if (value.toLowerCase() === "false") {
    return false;
  }

  return null;
}

/**
 * Format numerical RDF literals for display.
 * Does not infer units or serving sizes.
 */
function formatValue(value: string): string {
  const number = Number(value);

  if (
    value.trim() !== "" &&
    Number.isFinite(number)
  ) {
    return number.toLocaleString("en-US", {
      maximumFractionDigits: 3,
    });
  }

  return value;
}

/**
 * Convert RDF predicate names into readable labels.
 *
 * Example:
 *   compatibleAvecRegime -> Compatible Avec Regime
 */
function formatPropertyName(value: string): string {
  return value
    .replace(/^a(?=[A-Z])/, "")
    .replace(/_/g, " ")
    .replace(/([a-zà-ÿ])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) =>
      letter.toUpperCase()
    );
}

/**
 * Extract the local name from an RDF URI.
 */
function localName(value: string): string {
  const afterHash = value.split("#").pop() ?? value;

  return (
    afterHash.split("/").pop() ??
    afterHash
  );
}

/**
 * Make ontology resource identifiers readable.
 *
 * Examples:
 *   RegimeVegetarien1 -> Vegetarien
 *   ObjectifPertePoids1 -> Perte Poids
 *   ProfilSportif1 -> Sportif
 *
 * Only changes the visible label.
 * The original RDF identifier is preserved.
 */
function readableResourceName(value: string): string {
  return localName(value)
    .replace(/^Regime/, "")
    .replace(/^Objectif/, "")
    .replace(/^Profil/, "")
    .replace(/(\d+)$/, "")
    .replace(/_/g, " ")
    .replace(/([a-zà-ÿ])([A-Z])/g, "$1 $2")
    .trim();
}

/**
 * Build semantic groups from explicit URI relationships.
 *
 * This does not infer compatibility.
 * A missing relationship remains unknown.
 */
function groupSemanticRelations(
  properties: FoodProperty[]
): SemanticGroup[] {
  const relations = properties.filter(
    (item) =>
      item.value_type === "uri" &&
      item.property !== "type"
  );

  const dietPredicates = [
    "compatibleAvecRegime",
    "estCompatibleAvecRegime",
  ];

  const goalPredicates = [
    "adapteAObjectif",
    "estAdapteAObjectif",
  ];

  const profilePredicates = [
    "compatibleAvecProfil",
    "estCompatibleAvecProfil",
  ];

  const knownPredicates = [
    ...dietPredicates,
    ...goalPredicates,
    ...profilePredicates,
  ];

  return [
    {
      title: "Compatible dietary regimes",
      description:
        "Dietary regimes explicitly linked to this food.",
      icon: Leaf,
      relations: relations.filter((item) =>
        dietPredicates.includes(item.property)
      ),
    },
    {
      title: "Health goals",
      description:
        "Health objectives explicitly associated with this food.",
      icon: Sprout,
      relations: relations.filter((item) =>
        goalPredicates.includes(item.property)
      ),
    },
    {
      title: "Activity profiles",
      description:
        "Activity profiles explicitly associated with this food.",
      icon: ShieldCheck,
      relations: relations.filter((item) =>
        profilePredicates.includes(item.property)
      ),
    },
    {
      title: "Other RDF relationships",
      description:
        "Additional semantic connections in the ontology.",
      icon: Database,
      relations: relations.filter(
        (item) =>
          !knownPredicates.includes(item.property)
      ),
    },
  ];
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function FoodDetails() {
  const { foodName } = useParams<{
    foodName: string;
  }>();

  // ----------------------------------------------------------
  // STATE
  // ----------------------------------------------------------

  const [
    food,
    setFood,
  ] = useState<FoodDetailsResponse | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [reloadKey, setReloadKey] =
    useState(0);

  // Module "Gestion des aliments": admin edit / delete.
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showEdit, setShowEdit] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  async function removeFood(id: string, name: string) {
    const message = `Delete ${name}? Its environmental impacts and its links to meals, diets and recommendations will be deleted too.`;
    if (!window.confirm(message)) return;
    try {
      await deleteFood(id);
      navigate("/foods");
    } catch (err) {
      setAdminError(errorMessage(err, "The food could not be deleted."));
    }
  }

  // ----------------------------------------------------------
  // FETCH FOOD DETAILS
  // ----------------------------------------------------------

  useEffect(() => {
    let active = true;

    async function loadFood() {
      if (!foodName) {
        setFood(null);
        setError(
          "No food identifier was provided."
        );
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setFood(null);

      try {
        const response =
          await api.get<FoodDetailsResponse>(
            `/api/foods/${encodeURIComponent(
              foodName
            )}`
          );

        if (active) {
          setFood(response.data);
        }
      } catch (err: unknown) {
        if (!active) {
          return;
        }

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

  const properties = useMemo(
    () => food?.properties ?? [],
    [food]
  );

  const category = useMemo(() => {
    const types = getProperties(
      properties,
      "type"
    );

    return (
      types.find(
        (item) =>
          item.value !== "NamedIndividual"
      )?.value ?? "Food"
    );
  }, [properties]);

  const nutrients = useMemo(
    () =>
      nutritionFields.map((field) => ({
        ...field,
        values: getProperties(
          properties,
          field.key
        ),
      })),
    [properties]
  );

  const semanticGroups = useMemo(
    () => groupSemanticRelations(properties),
    [properties]
  );

  const knownNutritionKeys = useMemo(
    () =>
      new Set(
        nutritionFields.map(
          (field) => field.key
        )
      ),
    []
  );

  const otherProperties = useMemo(
    () =>
      properties.filter(
        (item) =>
          !knownNutritionKeys.has(
            item.property
          ) &&
          ![
            "type",
            "estBio",
            "estLocal",
            "scoreNutritionnel",
            "prixMoyen",
          ].includes(item.property) &&
          item.value_type !== "uri"
      ),
    [properties, knownNutritionKeys]
  );

  const organic = getBooleanValue(
    properties,
    "estBio"
  );

  const local = getBooleanValue(
    properties,
    "estLocal"
  );

  const nutritionScore = getFirstValue(
    properties,
    "scoreNutritionnel"
  );

  const averagePrice = getFirstValue(
    properties,
    "prixMoyen"
  );

  // ----------------------------------------------------------
  // LOADING STATE
  // ----------------------------------------------------------

  if (loading) {
    return (
      <div className="food-details-page">
        <div
          className="food-details-state"
          role="status"
        >
          <LoaderCircle
            className="food-details-spinner"
            size={36}
          />

          <h2>Loading food details</h2>

          <p>
            Retrieving semantic information
            from EatHealthy...
          </p>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------
  // ERROR STATE
  // ----------------------------------------------------------

  if (error || !food) {
    return (
      <div className="food-details-page">
        <Link
          to="/foods"
          className="food-details-back"
        >
          <ArrowLeft size={17} />
          Back to Food Explorer
        </Link>

        <div
          className="food-details-state"
          role="alert"
        >
          <CircleHelp size={40} />

          <h2>Food details unavailable</h2>

          <p>
            {error ??
              "No data was returned."}
          </p>

          <button
            type="button"
            className="food-details-retry"
            onClick={() =>
              setReloadKey(
                (value) => value + 1
              )
            }
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
      {/* BACK NAVIGATION */}

      <Link
        to="/foods"
        className="food-details-back"
      >
        <ArrowLeft size={17} />
        Back to Food Explorer
      </Link>

      {/* ADMIN ACTIONS (module "Gestion des aliments") */}

      {user?.role === "admin" ? (
        <div className="eh-actions">
          <button type="button" className="eh-button secondary" onClick={() => setShowEdit(true)}>Edit food</button>
          <button type="button" className="eh-button danger"
            onClick={() => void removeFood(food.name, food.label ?? food.name)}>Delete food</button>
        </div>
      ) : (
        <p className="eh-admin-note">{ADMIN_ONLY}</p>
      )}
      {adminError && <div className="eh-error" role="alert">{adminError}</div>}
      {showEdit && (
        <FoodForm
          food={food}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            setReloadKey((value) => value + 1);
          }}
        />
      )}

      {/* ======================================================
          HERO
          ====================================================== */}

      <section className="food-details-hero">
        <div className="food-details-hero-main">
          <div className="food-details-hero-icon">
            <Leaf size={34} />
          </div>

          <div>
            <span className="food-details-eyebrow">
              EATHEALTHY FOOD EXPLORER
            </span>

            <h1>
              {food.label ??
                readableResourceName(
                  food.name
                )}
            </h1>

            <div className="food-details-hero-meta">
              <span className="food-details-category">
                <Sprout size={14} />
                {readableResourceName(
                  category
                )}
              </span>

              <span className="food-details-source">
                <Database size={14} />
                Semantic ontology
              </span>
            </div>
          </div>
        </div>

        <div className="food-details-hero-stat">
          <strong>
            {food.properties_count}
          </strong>

          <span>RDF properties</span>
        </div>
      </section>

      {/* ======================================================
          MAIN LAYOUT
          ====================================================== */}

      <div className="food-details-layout">
        <main className="food-details-main">
          {/* ENVIRONMENTAL IMPACT (read-only; the CRUD is on the Impacts page) */}

          <section className="food-details-panel">
            <span className="food-details-section-kicker">ENVIRONMENT</span>
            <h2>Environmental impact</h2>
            <div className="eh-badges">
              <span className={co2Badge(food.co2 ?? null).className} title={co2Badge(food.co2 ?? null).title}>
                {co2Badge(food.co2 ?? null).label}
              </span>
              {food.sustainable && <span className="eh-badge sustainable">Sustainable</span>}
            </div>
            <p>Carbon: <strong>{food.co2 != null ? `${food.co2} kg CO2e/kg` : "not set"}</strong></p>
            <p>Water: <strong>{food.water != null ? `${food.water} L/kg` : "not set"}</strong></p>
            <Link className="eh-link" to="/impacts">Manage impacts →</Link>
          </section>

          {/* ================================================
              NUTRITION
              ================================================ */}

          <section className="food-details-panel">
            <div className="food-details-section-heading">
              <div>
                <span className="food-details-section-kicker">
                  NUTRITION
                </span>

                <h2>
                  Nutritional information
                </h2>

                <p>
                  Values retrieved directly
                  from the EatHealthy ontology.
                </p>
              </div>
            </div>

            <div className="food-details-nutrition-grid">
              {nutrients.map(
                (nutrient) => {
                  const Icon =
                    nutrient.icon;

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
                        {nutrient.values.length >
                        0 ? (
                          nutrient.values.map(
                            (
                              item,
                              index
                            ) => (
                              <span
                                key={`${item.value}-${index}`}
                              >
                                {formatValue(
                                  item.value
                                )}

                                {nutrient.unit && (
                                  <small>
                                    {
                                      nutrient.unit
                                    }
                                  </small>
                                )}
                              </span>
                            )
                          )
                        ) : (
                          <span className="food-details-no-value">
                            Not available
                          </span>
                        )}
                      </div>

                      {nutrient.values
                        .length > 1 && (
                        <span className="food-details-multiple-note">
                          Multiple values
                          in ontology
                        </span>
                      )}
                    </div>
                  );
                }
              )}
            </div>

            <p className="food-details-data-note">
              Measurement units and
              serving sizes have not
              been confirmed in the
              ontology response.
              Multiple values are
              displayed separately.
            </p>
          </section>

          {/* ================================================
              SEMANTIC RELATIONSHIPS
              ================================================ */}

          <section className="food-details-panel">
            <div className="food-details-section-heading">
              <div>
                <span className="food-details-section-kicker">
                  KNOWLEDGE GRAPH
                </span>

                <h2>
                  Semantic relationships
                </h2>

                <p>
                  Explicit relationships
                  recorded in the
                  EatHealthy ontology.
                </p>
              </div>

              <Database size={21} />
            </div>

            <div className="food-details-semantic-groups">
              {semanticGroups.map(
                (group) => {
                  const Icon =
                    group.icon;

                  return (
                    <div
                      className="food-details-semantic-group"
                      key={group.title}
                    >
                      <div
                        className="food-details-semantic-group-heading"
                        style={{
                          display: "flex",
                          alignItems:
                            "center",
                          gap: "10px",
                          marginBottom:
                            "12px",
                        }}
                      >
                        <div className="food-details-relation-icon">
                          <Icon
                            size={18}
                          />
                        </div>

                        <div>
                          <h3
                            style={{
                              margin: 0,
                              fontSize:
                                "15px",
                            }}
                          >
                            {group.title}
                          </h3>

                          <p
                            style={{
                              margin:
                                "5px 0 0",
                              fontSize:
                                "12px",
                              color:
                                "#829187",
                            }}
                          >
                            {
                              group.description
                            }
                          </p>
                        </div>
                      </div>

                      {group.relations
                        .length > 0 ? (
                        <div className="food-details-relations">
                          {group.relations.map(
                            (
                              relation,
                              index
                            ) => (
                              <div
                                className="food-details-relation"
                                key={`${relation.property}-${relation.value}-${index}`}
                              >
                                <div className="food-details-relation-icon">
                                  <Icon
                                    size={
                                      18
                                    }
                                  />
                                </div>

                                <div className="food-details-relation-content">
                                  <span>
                                    {formatPropertyName(
                                      relation.property
                                    )}
                                  </span>

                                  <strong>
                                    {readableResourceName(
                                      relation.value
                                    )}
                                  </strong>
                                </div>

                                {relation.value_uri && (
                                  <a
                                    href={
                                      relation.value_uri
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="food-details-relation-link"
                                    title="Open RDF resource URI"
                                  >
                                    <ArrowUpRight
                                      size={
                                        17
                                      }
                                    />
                                  </a>
                                )}
                              </div>
                            )
                          )}
                        </div>
                      ) : (
                        <div className="food-details-empty">
                          No explicit
                          relationships
                          recorded.
                        </div>
                      )}
                    </div>
                  );
                }
              )}
            </div>

            <p className="food-details-data-note">
              Missing relationships
              indicate unavailable
              information, not
              confirmed incompatibility.
            </p>
          </section>

          {/* ================================================
              ADDITIONAL RDF PROPERTIES
              ================================================ */}

          {otherProperties.length >
            0 && (
            <section className="food-details-panel">
              <div className="food-details-section-heading">
                <div>
                  <span className="food-details-section-kicker">
                    ONTOLOGY
                  </span>

                  <h2>
                    Additional properties
                  </h2>
                </div>
              </div>

              <div className="food-details-property-list">
                {otherProperties.map(
                  (
                    property,
                    index
                  ) => (
                    <div
                      className="food-details-property-row"
                      key={`${property.property}-${index}`}
                    >
                      <span>
                        {formatPropertyName(
                          property.property
                        )}
                      </span>

                      <strong>
                        {property.value}
                      </strong>
                    </div>
                  )
                )}
              </div>
            </section>
          )}
        </main>

        {/* ==================================================
            SIDEBAR
            ================================================== */}

        <aside className="food-details-sidebar">
          {/* FOOD ATTRIBUTES */}

          <section className="food-details-panel">
            <span className="food-details-section-kicker">
              FOOD PROFILE
            </span>

            <h2>
              Food attributes
            </h2>

            <div className="food-details-attributes">
              {/* ORGANIC */}

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
                    <CheckCircle2
                      size={15}
                    />
                  ) : organic === false ? (
                    <XCircle
                      size={15}
                    />
                  ) : (
                    <CircleHelp
                      size={15}
                    />
                  )}

                  {organic === null
                    ? "Unknown"
                    : organic
                      ? "Yes"
                      : "No"}
                </span>
              </div>

              {/* LOCALLY SOURCED */}

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
                    <CheckCircle2
                      size={15}
                    />
                  ) : local === false ? (
                    <XCircle
                      size={15}
                    />
                  ) : (
                    <CircleHelp
                      size={15}
                    />
                  )}

                  {local === null
                    ? "Unknown"
                    : local
                      ? "Yes"
                      : "No"}
                </span>
              </div>

              {/* NUTRITION SCORE */}

              <div className="food-details-attribute">
                <span className="food-details-attribute-label">
                  Nutrition score
                </span>

                <strong>
                  {nutritionScore !== null
                    ? formatValue(
                        nutritionScore
                      )
                    : "Not available"}
                </strong>
              </div>

              {/* AVERAGE PRICE */}

              <div className="food-details-attribute">
                <span className="food-details-attribute-label">
                  Average price
                </span>

                <strong>
                  {averagePrice !== null
                    ? formatValue(
                        averagePrice
                      )
                    : "Not available"}
                </strong>
              </div>
            </div>

            <p className="food-details-sidebar-note">
              Scores and prices use
              values stored in the
              ontology. Their scales
              and currency have not
              been verified.
            </p>
          </section>

          {/* RDF RESOURCE */}

          <section className="food-details-panel food-details-rdf-panel">
            <div className="food-details-rdf-heading">
              <Database size={20} />

              <h2>
                RDF resource
              </h2>
            </div>

            <p>
              This food is represented
              as an individual in the
              EatHealthy knowledge graph.
            </p>

            <div className="food-details-uri">
              {food.uri}
            </div>

            <div className="food-details-rdf-count">
              <span>
                Properties returned
              </span>

              <strong>
                {food.properties_count}
              </strong>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
