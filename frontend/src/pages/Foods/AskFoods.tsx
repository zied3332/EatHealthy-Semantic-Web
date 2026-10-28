// The AI box: a question becomes SPARQL (Groq), Fuseki runs it, and we show the answer, the table and the SPARQL.
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Bot, Send } from "lucide-react";

import { askFoods, errorMessage, getExamples } from "../../services/aliments";
import type { AskResponse } from "../../services/aliments";
import "./aliments.css";

function cell(value: string | number | boolean | null) {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return typeof value === "number" ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : value;
}

export default function AskFoods() {
  const [question, setQuestion] = useState("");
  const [examples, setExamples] = useState<string[]>([]);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSparql, setShowSparql] = useState(false);

  useEffect(() => {
    getExamples().then(setExamples).catch(() => setExamples([]));
  }, []);

  async function ask(text: string) {
    if (text.trim().length < 3 || loading) return;
    setQuestion(text);
    setLoading(true);
    setError(null);
    try {
      setResult(await askFoods(text.trim()));
    } catch (err) {
      setResult(null);
      setError(errorMessage(err, "The question could not be answered."));
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(question);
  }

  return (
    <section className="ask-box">
      <h2><Bot size={20} /> Ask the food knowledge graph</h2>
      <p className="eh-muted">
        Your question → Groq writes SPARQL → the query is checked → Fuseki runs it on the ontology → answer
      </p>

      <form className="ask-form" onSubmit={submit}>
        <input value={question} maxLength={300} aria-label="Your question"
          placeholder="Quels fruits locaux ont une faible empreinte carbone ?"
          onChange={(e) => setQuestion(e.target.value)} />
        <button type="submit" className="eh-button" disabled={loading || question.trim().length < 3}>
          <Send size={16} /> {loading ? "Thinking…" : "Send"}
        </button>
      </form>

      <div className="ask-examples">
        {examples.map((example) => (
          <button type="button" key={example} disabled={loading} onClick={() => void ask(example)}>
            {example}
          </button>
        ))}
      </div>

      {error && <div className="eh-error" role="alert">{error}</div>}

      {result && (
        <div className="ask-result" aria-live="polite">
          <p className="ask-answer">{result.answer}</p>
          {result.mode !== "none" && (
            <span className={`eh-badge ${result.mode === "groq" ? "low" : "medium"}`}>
              {result.mode === "groq" ? "AI" : "Saved example"}
            </span>
          )}
          {result.explanation && <p className="eh-muted">{result.explanation}</p>}

          {result.rows.length > 0 && (
            <div className="eh-table-wrap">
              <table className="eh-table">
                <thead>
                  <tr>{result.columns.map((c) => <th key={c}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i}>{result.columns.map((c) => <td key={c}>{cell(row[c])}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.sparql && (
            <>
              <button type="button" className="eh-button secondary" onClick={() => setShowSparql(!showSparql)}>
                {showSparql ? "Hide SPARQL" : "Show SPARQL"}
              </button>
              {showSparql && <pre className="ask-sparql">{result.sparql}</pre>}
            </>
          )}
        </div>
      )}
    </section>
  );
}
