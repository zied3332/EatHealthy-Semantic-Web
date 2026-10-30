
import { useState } from "react";
import {
  BrainCircuit,
  Search,
  Sparkles,
  Code2,
  Database,
  Copy,
  Check,
  MessageSquareText,
  ArrowRight,
  Info,
  AlertCircle,
} from "lucide-react";

import "./SemanticSearch.css";

// ============================================================
// CONFIGURATION
// ============================================================

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/$/, "");

// ============================================================
// EXAMPLE QUESTIONS
// ============================================================

const EXAMPLES = [
  {
    label: "Omnivore users",
    question: "Quels utilisateurs suivent un régime omnivore ?",
  },
  {
    label: "Vegetarian users",
    question: "Qui sont les personnes végétariennes ?",
  },
  {
    label: "Muscle gain",
    question: "Qui souhaite prendre de la masse ?",
  },
  {
    label: "Weight loss",
    question: "Quels utilisateurs veulent perdre du poids ?",
  },
  {
    label: "Combined search",
    question:
      "Quels utilisateurs sont omnivores et souhaitent perdre du poids ?",
  },
  {
    label: "Count fruits",
    question: "Combien de fruits y a-t-il ?",
  },
];

// ============================================================
// TYPES
// ============================================================

type ResultValue = string | number | boolean | null;

interface FoodEntity {
  text?: string;
  type?: string;
  id?: string;
  corrected?: boolean;
}

interface HealthEntities {
  individual?: string;
  label?: string;
  secondary_individual?: string | null;
  secondary_label?: string | null;
}

interface SearchResult {
  question: string;
  domain: string;
  intent: string;
  entities: HealthEntities | FoodEntity[];
  sparql: string;
  results: Record<string, ResultValue>[];
  count: number;
  answer?: string | null;
  confidence?: number | null;
  boolean?: boolean | null;
}

// ============================================================
// HELPERS
// ============================================================

function formatValue(value: ResultValue): string {
  if (value === null || value === undefined) {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  const text = String(value);

  if (text.includes("#")) {
    return text.split("#").pop() || text;
  }

  return text;
}

function getErrorMessage(
  status: number,
  detail: unknown
): string {
  if (typeof detail === "string") {
    return detail;
  }

  if (status === 422) {
    return "Question non reconnue. Essayez une autre formulation.";
  }

  if (status === 502) {
    return "Impossible de communiquer avec Apache Jena Fuseki.";
  }

  return `La requête a échoué (HTTP ${status}).`;
}

function getEntityLabels(
  entities: SearchResult["entities"]
): string[] {
  if (Array.isArray(entities)) {
    return entities.map((entity) => {
      const label = entity.text || entity.id || "Unknown";

      return entity.type
        ? `${label} (${entity.type})`
        : label;
    });
  }

  return [
    entities.label,
    entities.secondary_label,
  ].filter((value): value is string => Boolean(value));
}

function getColumns(
  rows: SearchResult["results"]
): string[] {
  return Array.from(
    new Set(rows.flatMap((row) => Object.keys(row)))
  );
}

// ============================================================
// COMPONENT
// ============================================================

export default function SemanticSearch() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<SearchResult | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ==========================================================
  // NLP SEARCH
  // ==========================================================

  async function handleSearch() {
    const text = question.trim();

    if (!text || loading) return;

    setLoading(true);
    setResult(null);
    setCopied(false);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/nlp/query`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question: text,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          getErrorMessage(response.status, data.detail)
        );
      }

      setResult(data as SearchResult);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred."
      );
    } finally {
      setLoading(false);
    }
  }

  // ==========================================================
  // COPY SPARQL
  // ==========================================================

  async function handleCopy() {
    if (!result?.sparql) return;

    try {
      await navigator.clipboard.writeText(result.sparql);
      setCopied(true);
    } catch {
      setError("Unable to copy SPARQL to clipboard.");
    }
  }

  // ==========================================================
  // DERIVED DATA
  // ==========================================================

  const entityLabels = result
    ? getEntityLabels(result.entities)
    : [];

  const columns = result
    ? getColumns(result.results)
    : [];

  const confidence =
    typeof result?.confidence === "number"
      ? `${(result.confidence * 100).toFixed(1)}%`
      : null;

  const isFoodDomain = result?.domain === "food_nutrition";

  const aggregateCount =
    result?.intent === "count" &&
    result.results.length === 1 &&
    typeof result.results[0].nombre === "number"
      ? result.results[0].nombre
      : null;

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="semantic-page">
      {/* HERO */}

      <header className="semantic-hero">
        <div className="semantic-hero-icon">
          <BrainCircuit size={30} />
        </div>

        <div className="semantic-hero-content">
          <span className="semantic-eyebrow">
            NATURAL LANGUAGE PROCESSING
          </span>

          <h1>Semantic AI Search</h1>

          <p>
            Ask questions in natural language and explore
            EatHealthy's semantic knowledge graph using
            spaCy, SPARQL, and Apache Jena Fuseki.
          </p>
        </div>
      </header>

      {/* QUESTION CARD */}

      <section className="semantic-card">
        <div className="semantic-section-title">
          <MessageSquareText size={22} />
          <h2>Ask a question</h2>
        </div>

        <label htmlFor="semantic-question">
          Your question
        </label>

        <textarea
          id="semantic-question"
          value={question}
          onChange={(event) => {
            setQuestion(event.target.value);
            setResult(null);
            setError(null);
          }}
          placeholder="Ex: Quels utilisateurs suivent un régime omnivore ?"
          rows={4}
        />

        <div className="semantic-examples">
          <span>Try an example question</span>

          <div className="semantic-example-list">
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => {
                  setQuestion(example.question);
                  setResult(null);
                  setError(null);
                }}
              >
                <Sparkles size={14} />
                {example.label}
              </button>
            ))}
          </div>
        </div>

        <button
          className="semantic-search-button"
          type="button"
          disabled={!question.trim() || loading}
          onClick={handleSearch}
        >
          <Search size={18} />
          {loading ? "Analyzing..." : "Analyze question"}
          <ArrowRight size={17} />
        </button>

        <p className="semantic-helper-text">
          <Info size={15} />
          Powered by spaCy NLP and Apache Jena Fuseki.
          Only supported semantic question types can be analyzed.
        </p>

        {error && (
          <div className="semantic-error" role="alert">
            <AlertCircle size={19} />
            <span>{error}</span>
          </div>
        )}
      </section>

      {/* RESULTS */}

      {result && (
        <section className="semantic-results">
          <div className="semantic-results-heading">
            <div>
              <span className="semantic-eyebrow">
                SEMANTIC ANALYSIS
              </span>

              <h2>Query analysis</h2>
            </div>

            <span className="semantic-preview-badge">
              Live Fuseki results
            </span>
          </div>

          {/* DETECTED INTENT */}

          <div className="semantic-intent-card">
            <BrainCircuit size={23} />

            <div>
              <span>Detected intent</span>

              <strong>{result.intent}</strong>

              <span>
                Domain:{" "}
                {isFoodDomain
                  ? "Food & Nutrition"
                  : "Health Preferences"}
              </span>

              {entityLabels.length > 0 && (
                <span>
                  Entities: {entityLabels.join(" · ")}
                </span>
              )}

              {confidence && (
                <span>
                  Classifier confidence: {confidence}
                </span>
              )}
            </div>
          </div>

          {/* NATURAL LANGUAGE ANSWER */}

          {result.answer && (
            <div className="semantic-intent-card">
              <MessageSquareText size={23} />

              <div>
                <span>Natural-language answer</span>
                <strong>{result.answer}</strong>
              </div>
            </div>
          )}

          {/* GENERATED SPARQL */}

          <div className="semantic-code-card">
            <div className="semantic-code-header">
              <div>
                <Code2 size={20} />
                <h3>Generated SPARQL</h3>
              </div>

              <button
                type="button"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check size={17} />
                ) : (
                  <Copy size={17} />
                )}

                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <pre>
              <code>{result.sparql}</code>
            </pre>
          </div>

          {/* DATABASE RESULTS */}

          <div className="semantic-data-card">
            <div className="semantic-section-title">
              <Database size={21} />

              <h3>
                Query results (
                {aggregateCount !== null
                  ? aggregateCount
                  : result.count}
                )
              </h3>
            </div>

            {result.results.length > 0 ? (
              <div className="semantic-table-wrapper">
                <table className="semantic-table">
                  <thead>
                    <tr>
                      {columns.map((column) => (
                        <th key={column}>
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {result.results.map((row, index) => (
                      <tr key={index}>
                        {columns.map((column) => (
                          <td
                            key={column}
                            title={formatValue(row[column])}
                          >
                            {formatValue(row[column])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="semantic-empty-state">
                <Database size={30} />

                <h4>No matching records</h4>

                <p>
                  The query executed successfully, but
                  no matching records were found in Fuseki.
                </p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
