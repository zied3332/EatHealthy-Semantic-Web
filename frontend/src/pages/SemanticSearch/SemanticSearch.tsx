
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
} from "lucide-react";

import "./SemanticSearch.css";

// ============================================================
// EXAMPLE QUESTIONS
// ============================================================

const EXAMPLES = [
  {
    label: "Vegetarian users",
    question: "Quels utilisateurs suivent un régime végétarien ?",
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
    label: "Protein-rich foods",
    question: "Quels aliments sont riches en protéines ?",
  },
];

// ============================================================
// DEMONSTRATION QUERY
// ============================================================

const VEGETARIAN_SPARQL = `PREFIX eh: <http://www.semanticweb.org/thinkpad/ontologies/2026/9/EatHealthy#>

SELECT DISTINCT ?person
WHERE {
  ?person a eh:Personne ;
          eh:suitRegime eh:RegimeVegetarien1 .
}`;

// ============================================================
// TYPES
// ============================================================

interface SearchResult {
  question: string;
  intent: string;
  sparql: string;
  rows: Record<string, string>[];
  isPreview: boolean;
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

  // ==========================================================
  // FRONTEND PREVIEW SEARCH
  // ==========================================================

  function handleSearch() {
    const text = question.trim();

    if (!text) return;

    setLoading(true);
    setResult(null);
    setCopied(false);

    const normalized = text.toLowerCase();

    const isVegetarian =
      normalized.includes("végétarien") ||
      normalized.includes("vegetarian") ||
      normalized.includes("vegetarien");

    if (isVegetarian) {
      setResult({
        question: text,
        intent: "Search people by dietary regime",
        sparql: VEGETARIAN_SPARQL,
        rows: [],
        isPreview: true,
      });
    } else {
      setResult({
        question: text,
        intent: "Awaiting NLP backend analysis",
        sparql: "",
        rows: [],
        isPreview: true,
      });
    }

    setLoading(false);
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
      setCopied(false);
    }
  }

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
            Explore EatHealthy knowledge using natural
            language. Ask a question, discover its meaning,
            and see how it translates into SPARQL.
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
          }}
          placeholder="Ex: Quels utilisateurs suivent un régime végétarien ?"
          rows={4}
        />

        {/* EXAMPLES */}

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
                }}
              >
                <Sparkles size={14} />
                {example.label}
              </button>
            ))}
          </div>
        </div>

        {/* SEARCH BUTTON */}

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
          Currently using frontend preview mode.
          Live NLP and Fuseki integration are coming next.
        </p>
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
              Frontend preview
            </span>
          </div>

          {/* DETECTED INTENT */}

          <div className="semantic-intent-card">
            <BrainCircuit size={23} />

            <div>
              <span>Detected intent</span>
              <strong>{result.intent}</strong>
            </div>
          </div>

          {/* SPARQL */}

          <div className="semantic-code-card">
            <div className="semantic-code-header">
              <div>
                <Code2 size={20} />
                <h3>Generated SPARQL</h3>
              </div>

              {result.sparql && (
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
              )}
            </div>

            {result.sparql ? (
              <pre>
                <code>{result.sparql}</code>
              </pre>
            ) : (
              <p className="semantic-empty">
                No SPARQL query generated in preview mode.
                This question will be analyzed by the NLP
                backend once connected.
              </p>
            )}
          </div>

          {/* DATABASE RESULTS */}

          <div className="semantic-data-card">
            <div className="semantic-section-title">
              <Database size={21} />
              <h3>Query results</h3>
            </div>

            <div className="semantic-empty-state">
              <Database size={30} />

              <h4>No live results yet</h4>

              <p>
                The generated query will be executed against
                Apache Jena Fuseki once the backend NLP
                service is connected.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
