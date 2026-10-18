
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Database,
  HeartPulse,
  Leaf,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Target,
  UserRound,
} from "lucide-react";

import api from "../../services/api";
import { useProfile } from "../../context/ProfileContext";
import "./Recommendations.css";

interface Recommendation {
  uri: string;
  name: string;
  score: number;
  max_score: number;
  matches: {
    goal: boolean;
    diet: boolean;
    activity_profile: boolean;
  };
  restriction_status:
    | "unknown"
    | "not_applicable"
    | "explicitly_incompatible";
  reasons: string[];
}

interface RecommendationsResponse {
  person: string;
  restrictions: string[];
  count: number;
  recommendations: Recommendation[];
  excluded_count: number;
  excluded: Recommendation[];
  disclaimer: string;
}

const EMPTY_RECOMMENDATIONS: Recommendation[] = [];

function readableName(value: string): string {
  return value
    .replace(/^Restriction/, "")
    .replace(/^Regime/, "")
    .replace(/^Objectif/, "")
    .replace(/\d+$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

function FoodCard({
  food,
  restricted,
}: {
  food: Recommendation;
  restricted: boolean;
}) {
  const matches = [
    {
      label: "Health goal",
      active: food.matches.goal,
      icon: Target,
    },
    {
      label: "Dietary regime",
      active: food.matches.diet,
      icon: Leaf,
    },
    {
      label: "Activity profile",
      active: food.matches.activity_profile,
      icon: Activity,
    },
  ];

  return (
    <article className="recommendations-food-card">
      <div className="recommendations-food-top">
        <div className="recommendations-food-icon">
          <Leaf size={24} />
        </div>

        <div className="recommendations-food-heading">
          <span className="recommendations-kicker">
            ONTOLOGY FOOD
          </span>
          <h3>{food.name}</h3>
        </div>

        <div className="recommendations-score">
          <strong>{food.score}</strong>
          <span>/ {food.max_score}</span>
        </div>
      </div>

      <div className="recommendations-score-label">
        Matching semantic relationships
      </div>

      <div className="recommendations-match-list">
        {matches.map(({ label, active, icon: Icon }) => (
          <div
            key={label}
            className={`recommendations-match ${
              active ? "matched" : "unmatched"
            }`}
          >
            <Icon size={16} />
            <span>{label}</span>
            {active ? (
              <CheckCircle2 size={16} />
            ) : (
              <span className="recommendations-not-verified">
                Not asserted
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="recommendations-food-explanation">
        <strong>Why this food appears</strong>
        {food.reasons.length > 0 ? (
          <ul>
            {food.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : (
          <p>No positive compatibility evidence recorded.</p>
        )}
      </div>

      {restricted &&
        food.restriction_status === "unknown" && (
          <div className="recommendations-safety-warning">
            <AlertTriangle size={18} />
            <span>
              Restriction compatibility is unknown.
              Do not assume this food is safe.
            </span>
          </div>
        )}

      {food.restriction_status ===
        "explicitly_incompatible" && (
        <div className="recommendations-safety-warning">
          <ShieldAlert size={18} />
          <span>
            Explicitly incompatible with a recorded
            restriction.
          </span>
        </div>
      )}

      <div className="recommendations-food-footer">
        <Database size={14} />
        <span>Evidence from RDF assertions</span>
      </div>
    </article>
  );
}

export default function Recommendations() {
  const {
    persons,
    selectedPerson,
    setSelectedPerson,
    loading: profileLoading,
    error: profileError,
    refreshProfile,
  } = useProfile();

  const [data, setData] =
    useState<RecommendationsResponse | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showExcluded, setShowExcluded] = useState(false);

  useEffect(() => {
    if (profileLoading || profileError || !selectedPerson) {
      return;
    }

    let active = true;

    async function loadRecommendations() {
      setLoading(true);
      setError(null);
      setData(null);

      try {
        const response =
          await api.get<RecommendationsResponse>(
            `/api/recommendations/${encodeURIComponent(
              selectedPerson
            )}`
          );

        if (!active) return;

        if (
          !Array.isArray(response.data.recommendations) ||
          !Array.isArray(response.data.excluded)
        ) {
          throw new Error("Invalid recommendations response.");
        }

        setData(response.data);
      } catch (err) {
        if (!active) return;

        console.error(
          "Failed to load recommendations:",
          err
        );

        setError(
          "Unable to retrieve recommendations. Check FastAPI, Fuseki, and the recommendations endpoint."
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadRecommendations();

    return () => {
      active = false;
    };
  }, [
    selectedPerson,
    reloadKey,
    profileLoading,
    profileError,
  ]);

  const recommendations = useMemo(
    () =>
      [...(data?.recommendations ??
        EMPTY_RECOMMENDATIONS)].sort(
        (a, b) =>
          b.score - a.score ||
          a.name.localeCompare(b.name)
      ),
    [data]
  );

  const restrictions = data?.restrictions ?? [];
  const excluded = data?.excluded ?? [];
  const isLoading = profileLoading || loading;
  const displayError = profileError || error;

  function refreshAll() {
    refreshProfile();
    setReloadKey((value) => value + 1);
  }

  return (
    <main className="recommendations-page">
      {/* HEADER */}

      <header className="recommendations-header">
        <div>
          <div className="recommendations-eyebrow">
            <Sparkles size={16} />
            SEMANTIC INTELLIGENCE
          </div>

          <h1>Food Recommendations</h1>

          <p>
            Discover foods matched to your health goals,
            dietary regime, and activity profile using
            the EatHealthy knowledge graph.
          </p>
        </div>

        <div className="recommendations-header-icon">
          <HeartPulse size={34} />
        </div>
      </header>

      {/* TOOLBAR */}

      <section className="recommendations-toolbar">
        <div className="recommendations-user-selector">
          <UserRound size={19} />

          <label htmlFor="recommendations-person">
            Active profile
          </label>

          <select
            id="recommendations-person"
            value={selectedPerson}
            disabled={profileLoading || persons.length === 0}
            onChange={(event) =>
              setSelectedPerson(event.target.value)
            }
          >
            {persons.length === 0 && (
              <option value="">No users available</option>
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
        </div>

        <button
          type="button"
          className="recommendations-refresh"
          onClick={refreshAll}
          disabled={isLoading}
        >
          <RefreshCw size={17} />
          Refresh
        </button>
      </section>

      {/* LOADING */}

      {isLoading && (
        <div className="recommendations-state" role="status">
          <LoaderCircle
            className="recommendations-spinner"
            size={34}
          />
          <h2>Analyzing semantic relationships</h2>
          <p>
            Retrieving personalized matches from Fuseki...
          </p>
        </div>
      )}

      {/* ERROR */}

      {!isLoading && displayError && (
        <div
          className="recommendations-state recommendations-error"
          role="alert"
        >
          <CircleAlert size={32} />
          <h2>Unable to load recommendations</h2>
          <p>{displayError}</p>

          <button type="button" onClick={refreshAll}>
            Try again
          </button>
        </div>
      )}

      {/* NO PERSON */}

      {!isLoading &&
        !displayError &&
        !selectedPerson && (
          <div className="recommendations-state">
            <UserRound size={32} />
            <h2>No profile selected</h2>
            <p>
              Select an ontology user to view recommendations.
            </p>
          </div>
        )}

      {/* RESULTS */}

      {!isLoading &&
        !displayError &&
        selectedPerson &&
        data &&
        data.person === selectedPerson && (
          <>
            <section className="recommendations-summary">
              <div className="recommendations-summary-primary">
                <span className="recommendations-kicker">
                  PERSONALIZED RESULTS
                </span>

                <h2>{selectedPerson}</h2>

                <p>
                  Recommendations are generated from
                  matching RDF relationships.
                </p>
              </div>

              <div className="recommendations-summary-stat">
                <strong>{data.count}</strong>
                <span>Food candidates</span>
              </div>

              <div className="recommendations-summary-stat">
                <strong>{restrictions.length}</strong>
                <span>Recorded restrictions</span>
              </div>
            </section>

            {restrictions.length > 0 && (
              <section className="recommendations-notice">
                <ShieldAlert size={21} />

                <div>
                  <strong>
                    Dietary restriction verification required
                  </strong>

                  <p>
                    Recorded restrictions:{" "}
                    {restrictions
                      .map(readableName)
                      .join(", ")}.
                    Missing incompatibility assertions
                    do not prove that foods are safe.
                  </p>
                </div>
              </section>
            )}

            <section className="recommendations-section-heading">
              <div>
                <span className="recommendations-kicker">
                  MATCHED FOODS
                </span>
                <h2>Recommended candidates</h2>
                <p>
                  Ranked by the number of positive
                  semantic relationships.
                </p>
              </div>

              <span className="recommendations-result-count">
                {recommendations.length} results
              </span>
            </section>

            {recommendations.length > 0 ? (
              <div className="recommendations-grid">
                {recommendations.map((food) => (
                  <FoodCard
                    key={food.uri}
                    food={food}
                    restricted={restrictions.length > 0}
                  />
                ))}
              </div>
            ) : (
              <div className="recommendations-state">
                <Leaf size={30} />
                <h2>No matching foods found</h2>
                <p>
                  The ontology currently contains no
                  positive food matches for this profile.
                </p>
              </div>
            )}

            {excluded.length > 0 && (
              <section className="recommendations-excluded">
                <button
                  type="button"
                  className="recommendations-excluded-toggle"
                  onClick={() =>
                    setShowExcluded((value) => !value)
                  }
                  aria-expanded={showExcluded}
                >
                  <ShieldAlert size={19} />

                  <span>
                    {excluded.length} explicitly
                    incompatible foods
                  </span>

                  <ArrowRight
                    size={18}
                    className={
                      showExcluded ? "expanded" : ""
                    }
                  />
                </button>

                {showExcluded && (
                  <div className="recommendations-grid">
                    {excluded.map((food) => (
                      <FoodCard
                        key={food.uri}
                        food={food}
                        restricted
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            <footer className="recommendations-disclaimer">
              <Database size={19} />

              <p>
                {data.disclaimer}
                {" "}
                These are ontology-based candidate
                matches, not verified medical or
                dietary safety recommendations.
              </p>
            </footer>
          </>
        )}
    </main>
  );
}
