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
import { useProfile } from "../../context/ProfileContext";
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
function localName(value: string): string {
  const fragment = value.split("#").pop() ?? value;
  return fragment.split("/").pop() ?? fragment;
}
// ============================================================
// COMPONENT
// ============================================================
export default function Diets() {
  const {
    persons,
    selectedPerson,
    setSelectedPerson,
    selectedRelationships,
    dietaryPreferences,
    hasDietaryOverrides,
    setDietaryPreferences,
    resetDietaryPreferences,
    loading: profileLoading,
    error: profileError,
    refreshProfile,
  } = useProfile();
  const [diets, setDiets] = useState<Diet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
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
        if (active) setLoading(false);
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
  // ----------------------------------------------------------
  // READ THE SELECTED USER'S ONTOLOGY RELATIONSHIPS
  // ----------------------------------------------------------
  const recordedDietNames = useMemo(
    () =>
      Array.from(
        new Set(
          selectedRelationships
            .filter(
              (item) => item.property === "suitRegime"
            )
            .map((item) => localName(item.value))
        )
      ),
    [selectedRelationships]
  );
  const recordedRestrictionNames = useMemo(
    () =>
      Array.from(
        new Set(
          selectedRelationships
            .filter(
              (item) => item.property === "aRestriction"
            )
            .map((item) => localName(item.value))
        )
      ),
    [selectedRelationships]
  );
  // Shared draft selections are stored in ProfileContext.
  // The ontology remains the source of recorded preferences.
  const selectedDietUri =
    mainDiets.find((diet) => diet.name === dietaryPreferences.diet)?.uri ?? null;

  const glutenFree = Boolean(
    glutenFreeDiet && dietaryPreferences.restrictions.includes(glutenFreeDiet.name)
  );

  const selectedDiet = useMemo(
    () =>
      mainDiets.find(
        (diet) => diet.uri === selectedDietUri
      ) ?? null,
    [mainDiets, selectedDietUri]
  );
  const hasUnsavedChanges = hasDietaryOverrides;

  // ----------------------------------------------------------
  // SELECTION
  // ----------------------------------------------------------

  function selectDiet(uri: string) {
    const diet = mainDiets.find((item) => item.uri === uri);
    if (!diet || !selectedPerson) return;

    setDietaryPreferences({
      ...dietaryPreferences,
      diet: diet.name,
    });
  }

  function setGlutenFree(value: boolean) {
    if (!selectedPerson || !glutenFreeDiet) return;

    const restrictions = dietaryPreferences.restrictions.filter(
      (restriction) => restriction !== glutenFreeDiet.name
    );

    if (value) restrictions.push(glutenFreeDiet.name);

    setDietaryPreferences({
      ...dietaryPreferences,
      restrictions,
    });
  }

  function clearSelection() {
    if (!selectedPerson) return;
    setDietaryPreferences({ diet: null, restrictions: [] });
  }

  function resetToOntology() {
    resetDietaryPreferences();
  }

  function refreshAll() {
    setReloadKey((value) => value + 1);
    refreshProfile();
  }
  const selectedCount =
    (selectedDiet ? 1 : 0) +
    (glutenFree && glutenFreeDiet ? 1 : 0);
  const isLoading = loading || profileLoading;
  const displayError = error || profileError;
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
            EatHealthy knowledge graph and review the
            preferences associated with your selected profile.
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
          onClick={refreshAll}
          disabled={isLoading}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>
      {/* LOADING */}
      {isLoading && (
        <div className="diets-state" role="status">
          <LoaderCircle
            className="diets-spinner"
            size={34}
          />
          <h2>Loading dietary regimes</h2>
          <p>
            Retrieving profile and dietary data from
            the EatHealthy ontology...
          </p>
        </div>
      )}
      {/* ERROR */}
      {!isLoading && displayError && (
        <div
          className="diets-state diets-error"
          role="alert"
        >
          <CircleAlert size={36} />
          <h2>Unable to load dietary data</h2>
          <p>{displayError}</p>
          <button
            type="button"
            onClick={refreshAll}
          >
            Try Again
          </button>
        </div>
      )}
      {/* CONTENT */}
      {!isLoading && !displayError && (
        <>
          {/* ACTIVE USER */}
          <section className="diets-panel">
            <div className="diets-section-heading">
              <div>
                <span className="diets-section-kicker">
                  ACTIVE PROFILE
                </span>
                <h2>Selected ontology user</h2>
                <p>
                  Dietary preferences are loaded from
                  this person's RDF relationships.
                </p>
              </div>
            </div>
            <select
              aria-label="Select ontology user"
              value={selectedPerson}
              onChange={(event) =>
                setSelectedPerson(event.target.value)
              }
              disabled={persons.length === 0}
              style={{
                width: "100%",
                maxWidth: 360,
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid #d8e3dc",
                background: "transparent",
                color: "inherit",
              }}
            >
              {persons.length === 0 && (
                <option value="">
                  No users available
                </option>
              )}
              {persons.map((person) => (
                <option
                  key={person.uri}
                  value={person.name}
                >
                  {person.name}
                </option>
              ))}
            </select>
          </section>
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
                      Your recorded diet is selected
                      automatically. Changes here are
                      temporary and are not saved to Fuseki.
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
                            {selected && (
                              <Check size={16} />
                            )}
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
                        setGlutenFree(
                          event.target.checked
                        )
                      }
                      aria-label="Enable gluten-free restriction"
                    />
                    <span
                      className="diets-checkbox"
                      aria-hidden="true"
                    >
                      {glutenFree && (
                        <Check size={15} />
                      )}
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
            {/* SIDEBAR */}
            <aside className="diets-sidebar">
              <section className="diets-panel diets-summary-panel">
                <div className="diets-summary-heading">
                  <ShieldCheck size={22} />
                  <div>
                    <span className="diets-section-kicker">
                      {selectedPerson || "NO PROFILE"}
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
                        ? getDietInfo(
                            selectedDiet.type
                          ).title
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
                  <div className="diets-summary-item">
                    <span>Ontology diet</span>
                    <strong>
                      {recordedDietNames.join(", ") ||
                        "Not recorded"}
                    </strong>
                  </div>
                  <div className="diets-summary-item">
                    <span>Ontology restrictions</span>
                    <strong>
                      {recordedRestrictionNames.join(", ") ||
                        "None recorded"}
                    </strong>
                  </div>
                </div>
                {hasUnsavedChanges && (
                  <button
                    type="button"
                    className="diets-clear"
                    onClick={resetToOntology}
                  >
                    Restore ontology values
                  </button>
                )}
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
                  {hasUnsavedChanges
                    ? "You have temporary changes. They are not saved to Fuseki and will be lost when the browser is reloaded."
                    : "Preferences are loaded from the selected user's ontology relationships. Any changes you make are temporary and are not saved to Fuseki."}
                </p>
              </section>
              {/* ONTOLOGY DATA */}
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
        </>
      )}
    </div>
  );
}
