
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  CircleAlert,
  Database,
  Leaf,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sprout,
  Utensils,
  WheatOff,
} from "lucide-react";

import api from "../../services/api";
import "./Diets.css";

// ============================================================
// TYPES
// ============================================================

interface Diet {
  uri: string;
  name: string;
  type: string;
}

interface DietsResponse {
  count: number;
  diets: Diet[];
}

type DietIcon = typeof Leaf;

// ============================================================
// DIET CONFIGURATION
// ============================================================

// These are display labels, not hardcoded API results.
// The actual diet individuals come from Fuseki.

const dietInfo: Record<
  string,
  {
    title: string;
    description: string;
    icon: DietIcon;
  }
> = {
  Omnivore: {
    title: "Omnivore",
    description:
      "A dietary pattern that includes both plant-based and animal-derived foods.",
    icon: Utensils,
  },
  Vegan: {
    title: "Vegan",
    description:
      "A plant-based dietary pattern that excludes animal-derived foods.",
    icon: Sprout,
  },
  Vegetarien: {
    title: "Vegetarian",
    description:
      "A dietary pattern that excludes meat and fish.",
    icon: Leaf,
  },
  SansGluten: {
    title: "Gluten-free",
    description:
      "A dietary restriction that excludes gluten-containing foods.",
    icon: WheatOff,
  },
};

const GLUTEN_FREE_TYPE = "SansGluten";

// ============================================================
// HELPERS
// ============================================================

function getDietInfo(type: string) {
  return (
    dietInfo[type] ?? {
      title: type,
      description:
        "Dietary preference retrieved from the EatHealthy ontology.",
      icon: Leaf,
    }
  );
}

// ============================================================
// COMPONENT
// ============================================================

export default function Diets() {
  const [diets, setDiets] = useState<Diet[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // The main diet is selected by its RDF URI.
  const [selectedDietUri, setSelectedDietUri] = useState<
    string | null
  >(null);

  // Gluten-free is an independent restriction.
  const [glutenFree, setGlutenFree] = useState(false);

  // ----------------------------------------------------------
  // FETCH DIETS
  // ----------------------------------------------------------

  useEffect(() => {
    let active = true;

    async function loadDiets() {
      setLoading(true);
      setError(null);

      try {
        const response = await api.get<DietsResponse>(
          "/api/diets"
        );

        if (!active) return;

        if (!Array.isArray(response.data.diets)) {
          throw new Error("Invalid diet API response.");
        }

        setDiets(response.data.diets);
      } catch (err) {
        if (!active) return;

        console.error("Failed to load diets:", err);

        setError(
          "Unable to retrieve dietary preferences. Check that FastAPI and Fuseki are running."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadDiets();

    return () => {
      active = false;
    };
  }, [reloadKey]);

  // ----------------------------------------------------------
  // GROUP DIETS
  // ----------------------------------------------------------

  const mainDiets = useMemo(
    () =>
      diets.filter(
        (diet) => diet.type !== GLUTEN_FREE_TYPE
      ),
    [diets]
  );

  const glutenFreeDiet = useMemo(
    () =>
      diets.find(
        (diet) => diet.type === GLUTEN_FREE_TYPE
      ),
    [diets]
  );

  const selectedDiet = useMemo(
    () =>
      mainDiets.find(
        (diet) => diet.uri === selectedDietUri
      ) ?? null,
    [mainDiets, selectedDietUri]
  );

  // ----------------------------------------------------------
  // SELECTION
  // ----------------------------------------------------------

  function selectDiet(uri: string) {
    setSelectedDietUri(uri);
  }

  function clearSelection() {
    setSelectedDietUri(null);
    setGlutenFree(false);
  }

  const selectedCount =
    (selectedDiet ? 1 : 0) +
    (glutenFree && glutenFreeDiet ? 1 : 0);

  // ----------------------------------------------------------
  // RENDER
  // ----------------------------------------------------------

  return (
    <div className="diets-page">
      {/* HEADER */}

      <section className="diets-header">
        <div>
          <div className="diets-eyebrow">
            <Sprout size={16} />
            PERSONALIZED NUTRITION
          </div>

          <h1>Dietary Preferences</h1>

          <p>
            Explore dietary regimes represented in the
            EatHealthy knowledge graph and choose the
            preferences that match your needs.
          </p>
        </div>

        <div className="diets-header-icon">
          <Leaf size={35} />
        </div>
      </section>

      {/* TOOLBAR */}

      <div className="diets-toolbar">
        <div className="diets-source">
          <Database size={17} />
          <span>Source: EatHealthy Ontology</span>
        </div>

        <button
          type="button"
          className="diets-refresh"
          onClick={() =>
            setReloadKey((value) => value + 1)
          }
          disabled={loading}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {/* LOADING */}

      {loading && (
        <div className="diets-state" role="status">
          <LoaderCircle
            className="diets-spinner"
            size={34}
          />

          <h2>Loading dietary regimes</h2>

          <p>
            Retrieving individuals from the
            EatHealthy ontology...
          </p>
        </div>
      )}

      {/* ERROR */}

      {!loading && error && (
        <div
          className="diets-state diets-error"
          role="alert"
        >
          <CircleAlert size={36} />

          <h2>Unable to load diets</h2>

          <p>{error}</p>

          <button
            type="button"
            onClick={() =>
              setReloadKey((value) => value + 1)
            }
          >
            Try Again
          </button>
        </div>
      )}

      {/* CONTENT */}

      {!loading && !error && (
        <div className="diets-layout">
          <div className="diets-main">
            {/* PRIMARY DIET */}

            <section className="diets-panel">
              <div className="diets-section-heading">
                <div>
                  <span className="diets-section-kicker">
                    STEP 01
                  </span>

                  <h2>Choose your main diet</h2>

                  <p>
                    Select one primary dietary pattern.
                    Your selection will be used later
                    for semantic food recommendations.
                  </p>
                </div>

                <span className="diets-section-count">
                  {mainDiets.length} available
                </span>
              </div>

              {mainDiets.length === 0 ? (
                <div className="diets-empty">
                  No primary dietary regimes were returned.
                </div>
              ) : (
                <div className="diets-options">
                  {mainDiets.map((diet) => {
                    const info = getDietInfo(diet.type);
                    const Icon = info.icon;

                    const selected =
                      selectedDietUri === diet.uri;

                    return (
                      <button
                        key={diet.uri}
                        type="button"
                        className={`diets-option ${
                          selected ? "selected" : ""
                        }`}
                        onClick={() =>
                          selectDiet(diet.uri)
                        }
                        aria-pressed={selected}
                      >
                        <span className="diets-option-icon">
                          <Icon size={23} />
                        </span>

                        <span className="diets-option-content">
                          <strong>{info.title}</strong>

                          <span>
                            {info.description}
                          </span>

                          <small>
                            RDF individual: {diet.name}
                          </small>
                        </span>

                        <span className="diets-option-check">
                          {selected && <Check size={16} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* RESTRICTIONS */}

            <section className="diets-panel">
              <div className="diets-section-heading">
                <div>
                  <span className="diets-section-kicker">
                    STEP 02
                  </span>

                  <h2>Dietary restrictions</h2>

                  <p>
                    Restrictions can be combined with
                    your selected primary diet.
                  </p>
                </div>
              </div>

              {glutenFreeDiet ? (
                <label
                  className={`diets-restriction ${
                    glutenFree ? "selected" : ""
                  }`}
                >
                  <span className="diets-restriction-icon">
                    <WheatOff size={22} />
                  </span>

                  <span className="diets-restriction-content">
                    <strong>Gluten-free</strong>

                    <span>
                      Exclude gluten-containing foods.
                    </span>

                    <small>
                      RDF individual: {glutenFreeDiet.name}
                    </small>
                  </span>

                  <input
                    type="checkbox"
                    checked={glutenFree}
                    onChange={(event) =>
                      setGlutenFree(event.target.checked)
                    }
                    aria-label="Enable gluten-free restriction"
                  />

                  <span
                    className="diets-checkbox"
                    aria-hidden="true"
                  >
                    {glutenFree && <Check size={15} />}
                  </span>
                </label>
              ) : (
                <div className="diets-empty">
                  No dietary restrictions were returned
                  by the ontology.
                </div>
              )}
            </section>
          </div>

          {/* SELECTION SUMMARY */}

          <aside className="diets-sidebar">
            <section className="diets-panel diets-summary-panel">
              <div className="diets-summary-heading">
                <ShieldCheck size={22} />

                <div>
                  <span className="diets-section-kicker">
                    YOUR SELECTION
                  </span>

                  <h2>Diet summary</h2>
                </div>
              </div>

              <div className="diets-summary-count">
                <strong>{selectedCount}</strong>

                <span>
                  selected preferences
                </span>
              </div>

              <div className="diets-summary-list">
                <div className="diets-summary-item">
                  <span>Main diet</span>

                  <strong>
                    {selectedDiet
                      ? getDietInfo(selectedDiet.type).title
                      : "Not selected"}
                  </strong>
                </div>

                <div className="diets-summary-item">
                  <span>Gluten-free</span>

                  <strong>
                    {glutenFree && glutenFreeDiet
                      ? "Enabled"
                      : "Disabled"}
                  </strong>
                </div>
              </div>

              {selectedCount > 0 && (
                <button
                  type="button"
                  className="diets-clear"
                  onClick={clearSelection}
                >
                  Clear selection
                </button>
              )}

              <p className="diets-summary-note">
                Your selection is currently held in
                this page's React state. It is not yet
                saved to a user profile.
              </p>
            </section>

            <section className="diets-panel diets-ontology-panel">
              <div className="diets-ontology-heading">
                <Database size={19} />
                <h2>Ontology data</h2>
              </div>

              <p>
                These dietary regimes are retrieved
                directly from Apache Jena Fuseki.
              </p>

              <div className="diets-ontology-stat">
                <span>RDF individuals</span>
                <strong>{diets.length}</strong>
              </div>

              <div className="diets-ontology-stat">
                <span>Primary diets</span>
                <strong>{mainDiets.length}</strong>
              </div>

              <div className="diets-ontology-stat">
                <span>Restrictions</span>
                <strong>
                  {glutenFreeDiet ? 1 : 0}
                </strong>
              </div>

              <div className="diets-ontology-footer">
                <CheckCircle2 size={16} />
                Connected to semantic backend
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
