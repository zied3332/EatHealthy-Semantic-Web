
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Database,
  HeartPulse,
  Leaf,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Target,
  UserRound,
} from "lucide-react";

import {
  useProfile,
  type ProfileRelationship,
} from "../../context/ProfileContext";

import "./Profile.css";

// ============================================================
// TYPES
// ============================================================

interface ProfileField {
  key: string;
  label: string;
  unit?: string;
}

// ============================================================
// FIELD CONFIGURATION
// ============================================================

const personalFields: ProfileField[] = [
  { key: "aNom", label: "Name" },
  { key: "aAge", label: "Age", unit: "years" },
  { key: "aSexe", label: "Sex" },
  { key: "aPoids", label: "Weight", unit: "kg" },
  { key: "aTaille", label: "Height" },
  { key: "aIMC", label: "Recorded BMI" },
];

const nutritionFields: ProfileField[] = [
  {
    key: "besoinCaloriqueJournalier",
    label: "Daily calorie requirement",
    unit: "kcal",
  },
  {
    key: "objectifCalories",
    label: "Daily calorie target",
    unit: "kcal",
  },
  {
    key: "nombreRepasJour",
    label: "Meals per day",
  },
  {
    key: "niveauActivite",
    label: "Recorded activity level",
  },
];

const semanticFields: ProfileField[] = [
  { key: "aProfil", label: "Health profile" },
  { key: "aObjectif", label: "Health goal" },
  { key: "suitRegime", label: "Dietary regime" },
  { key: "aRestriction", label: "Restrictions" },
  { key: "prefereAliment", label: "Preferred foods" },
  { key: "eviteAliment", label: "Avoided foods" },
];

// Properties normally expected to have one value.
const singleValueProperties = [
  "aNom",
  "aAge",
  "aSexe",
  "aPoids",
  "aTaille",
  "aIMC",
  "besoinCaloriqueJournalier",
  "objectifCalories",
  "nombreRepasJour",
  "niveauActivite",
  "aProfil",
  "aObjectif",
  "suitRegime",
];

// ============================================================
// HELPERS
// ============================================================

function readableName(value: string): string {
  return value
    .replace(/^Objectif/, "")
    .replace(/^Regime/, "")
    .replace(/^Profil/, "")
    .replace(/^Restriction/, "")
    .replace(/\d+$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

function getValues(
  relationships: ProfileRelationship[],
  property: string
): string[] {
  return Array.from(
    new Set(
      relationships
        .filter((item) => item.property === property)
        .map((item) => item.value)
    )
  );
}

function getDisplayValues(
  relationships: ProfileRelationship[],
  property: string
): string[] {
  const values = getValues(relationships, property);

  if (
    [
      "aProfil",
      "aObjectif",
      "suitRegime",
      "aRestriction",
      "prefereAliment",
      "eviteAliment",
    ].includes(property)
  ) {
    return values.map(readableName);
  }

  return values;
}

// ============================================================
// PROFILE VALUE
// ============================================================

function ProfileValue({
  values,
  unit,
}: {
  values: string[];
  unit?: string;
}) {
  if (values.length === 0) {
    return (
      <span className="profile-empty-value">
        Not recorded
      </span>
    );
  }

  return (
    <div className="profile-value-list">
      {values.map((value) => (
        <span className="profile-value" key={value}>
          {value}
          {unit ? ` ${unit}` : ""}
        </span>
      ))}

      {values.length > 1 && (
        <span
          className="profile-conflict"
          title="Multiple values are asserted in the ontology."
        >
          <AlertTriangle size={13} />
          Multiple recorded values
        </span>
      )}
    </div>
  );
}

// ============================================================
// FIELD GROUP
// ============================================================

function FieldGroup({
  fields,
  relationships,
}: {
  fields: ProfileField[];
  relationships: ProfileRelationship[];
}) {
  return (
    <div className="profile-fields">
      {fields.map((field) => (
        <div className="profile-field" key={field.key}>
          <span className="profile-field-label">
            {field.label}
          </span>

          <ProfileValue
            values={getDisplayValues(
              relationships,
              field.key
            )}
            unit={field.unit}
          />
        </div>
      ))}
    </div>
  );
}

// ============================================================
// PROFILE PAGE
// ============================================================

export default function Profile() {
  // All profile state now comes from the shared context.
  const {
    persons,
    selectedPerson,
    setSelectedPerson,
    selectedRelationships,
    loading,
    error,
    refreshProfile,
  } = useProfile();

  const selectedPersonOption = persons.find(
    (person) => person.name === selectedPerson
  );

  const nameValues = getValues(
    selectedRelationships,
    "aNom"
  );

  const displayName =
    nameValues.length === 1
      ? nameValues[0]
      : selectedPerson;

  const goal = getDisplayValues(
    selectedRelationships,
    "aObjectif"
  );

  const activity = getDisplayValues(
    selectedRelationships,
    "aProfil"
  );

  const diet = getDisplayValues(
    selectedRelationships,
    "suitRegime"
  );

  const restrictions = getDisplayValues(
    selectedRelationships,
    "aRestriction"
  );

  const conflictingProperties =
    singleValueProperties.filter(
      (property) =>
        getValues(
          selectedRelationships,
          property
        ).length > 1
    );

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <main className="profile-page">
      {/* HEADER */}

      <header className="profile-header">
        <div>
          <div className="profile-eyebrow">
            <HeartPulse size={16} />
            PERSONALIZED NUTRITION
          </div>

          <h1>My Health Profile</h1>

          <p>
            Explore personal health information,
            nutritional goals, and dietary preferences
            stored in the EatHealthy knowledge graph.
          </p>
        </div>

        <button
          className="profile-refresh"
          type="button"
          onClick={refreshProfile}
          disabled={loading}
        >
          <RefreshCw size={17} />
          Refresh
        </button>
      </header>

      {/* LOADING */}

      {loading && (
        <div className="profile-state" role="status">
          <LoaderCircle
            className="profile-spinner"
            size={30}
          />
          <p>Loading semantic profile data...</p>
        </div>
      )}

      {/* ERROR */}

      {!loading && error && (
        <div
          className="profile-state profile-error"
          role="alert"
        >
          <AlertTriangle size={28} />

          <h2>Connection error</h2>

          <p>{error}</p>

          <button
            type="button"
            onClick={refreshProfile}
          >
            Try again
          </button>
        </div>
      )}

      {/* PROFILE CONTENT */}

      {!loading && !error && (
        <>
          {/* PERSON SELECTOR */}

          <section className="profile-selector-card">
            <div className="profile-selector-icon">
              <UserRound size={24} />
            </div>

            <div className="profile-selector-content">
              <label htmlFor="profile-person">
                Select an ontology user
              </label>

              <p>
                Choose an existing Personne individual
                from Apache Jena Fuseki.
              </p>
            </div>

            <select
              id="profile-person"
              value={selectedPerson}
              onChange={(event) =>
                setSelectedPerson(event.target.value)
              }
              disabled={persons.length === 0}
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

          {selectedPersonOption ? (
            <>
              {/* PROFILE OVERVIEW */}

              <section className="profile-overview">
                <div className="profile-avatar">
                  <UserRound size={36} />
                </div>

                <div className="profile-overview-main">
                  <span className="profile-overview-label">
                    RDF INDIVIDUAL
                  </span>

                  <h2>{displayName}</h2>

                  <p>{selectedPerson}</p>
                </div>

                <span className="profile-readonly-badge">
                  <Database size={14} />
                  Read-only semantic data
                </span>
              </section>

              {/* SUMMARY CARDS */}

              <div className="profile-summary-grid">
                <article className="profile-summary-card">
                  <div className="profile-summary-icon">
                    <Target size={21} />
                  </div>

                  <span>Health goal</span>

                  <strong>
                    {goal.join(", ") || "Not recorded"}
                  </strong>
                </article>

                <article className="profile-summary-card">
                  <div className="profile-summary-icon">
                    <Activity size={21} />
                  </div>

                  <span>Activity profile</span>

                  <strong>
                    {activity.join(", ") || "Not recorded"}
                  </strong>
                </article>

                <article className="profile-summary-card">
                  <div className="profile-summary-icon">
                    <Leaf size={21} />
                  </div>

                  <span>Dietary regime</span>

                  <strong>
                    {diet.join(", ") || "Not recorded"}
                  </strong>
                </article>

                <article className="profile-summary-card">
                  <div className="profile-summary-icon">
                    <ShieldCheck size={21} />
                  </div>

                  <span>Restrictions</span>

                  <strong>
                    {restrictions.length > 0
                      ? restrictions.join(", ")
                      : "None recorded"}
                  </strong>
                </article>
              </div>

              {/* DATA CONFLICT WARNING */}

              {conflictingProperties.length > 0 && (
                <section
                  className="profile-warning"
                  role="alert"
                >
                  <AlertTriangle size={20} />

                  <div>
                    <strong>
                      Conflicting ontology values detected
                    </strong>

                    <p>
                      Some properties have multiple recorded
                      values:{" "}
                      {conflictingProperties.join(", ")}.
                      All values are displayed below. The
                      application does not automatically
                      decide which value is correct.
                    </p>
                  </div>
                </section>
              )}

              {/* DETAILS */}

              <div className="profile-content-grid">
                {/* PERSONAL INFORMATION */}

                <section className="profile-panel">
                  <div className="profile-panel-heading">
                    <UserRound size={20} />

                    <div>
                      <h3>Personal Information</h3>
                      <p>RDF datatype properties</p>
                    </div>
                  </div>

                  <FieldGroup
                    fields={personalFields}
                    relationships={selectedRelationships}
                  />
                </section>

                {/* NUTRITION */}

                <section className="profile-panel">
                  <div className="profile-panel-heading">
                    <HeartPulse size={20} />

                    <div>
                      <h3>Nutrition & Activity</h3>
                      <p>
                        Calorie targets and activity data
                      </p>
                    </div>
                  </div>

                  <FieldGroup
                    fields={nutritionFields}
                    relationships={selectedRelationships}
                  />
                </section>

                {/* SEMANTIC RELATIONSHIPS */}

                <section className="profile-panel profile-wide">
                  <div className="profile-panel-heading">
                    <Database size={20} />

                    <div>
                      <h3>Semantic Relationships</h3>
                      <p>
                        Links between this person and other
                        ontology individuals
                      </p>
                    </div>
                  </div>

                  <FieldGroup
                    fields={semanticFields}
                    relationships={selectedRelationships}
                  />
                </section>
              </div>

              {/* FOOTER */}

              <section className="profile-footer">
                <div>
                  <strong>
                    Powered by the EatHealthy ontology
                  </strong>

                  <p>
                    {selectedRelationships.length} RDF
                    property assertions retrieved for{" "}
                    {selectedPerson}.
                  </p>
                </div>

                <ArrowRight size={20} />
              </section>
            </>
          ) : (
            <div className="profile-state">
              <p>
                No Personne individuals were found
                in the ontology.
              </p>
            </div>
          )}
        </>
      )}
    </main>
  );
}
