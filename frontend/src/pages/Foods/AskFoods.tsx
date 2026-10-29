// The question box: NLP (spaCy + scikit-learn, no LLM) turns the question into SPARQL, Fuseki runs it, and we show every step.
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Bot, Send } from "lucide-react";

import { askFoods, errorMessage, getExamples } from "../../services/aliments";
import type { AskResponse, NlpAnalysis } from "../../services/aliments";
import "./aliments.css";

function cell(value: string | number | boolean | null) {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return typeof value === "number" ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : value;
}

const percent = (p: number) => `${Math.round(p * 100)} %`;

/** The 5 NLP steps, so the jury can see how the question became SPARQL. */
function NlpPanel({ nlp, sparql }: { nlp: NlpAnalysis; sparql: string | null }) {
  const others = nlp.top_intents.filter((t) => t.intent !== nlp.intent).slice(0, 2);
  return (
    <details className="nlp-panel" open>
      <summary>NLP analysis</summary>
      <ol>
        <li>
          <b>Tokens and lemmas</b> <span className="eh-muted">spaCy fr_core_news_sm</span>
          <div className="nlp-chips">
            {nlp.tokens.filter((t) => t.pos !== "PUNCT").map((t, i) => (
              <span key={i} className="nlp-chip" title={t.pos}>
                {t.text.toLowerCase() === t.lemma.toLowerCase() ? t.text : `${t.text} → ${t.lemma}`}
              </span>
            ))}
          </div>
        </li>
        <li>
          <b>Entities</b> <span className="eh-muted">PhraseMatcher on the ontology + difflib for typos</span>
          <div className="nlp-chips">
            {nlp.entities.length === 0 && <span className="eh-muted">No entity found.</span>}
            {nlp.entities.map((e, i) => (
              <span key={i} className={`nlp-chip entity ${e.type.toLowerCase()}`}>
                {e.text} <small>{e.type} · {e.type === "LEVEL" ? e.id : `eh:${e.id}`}{e.corrected && " · typo fixed"}</small>
              </span>
            ))}
          </div>
        </li>
        <li>
          <b>Delexicalized text</b> <code className="nlp-masked">{nlp.masked}</code>
        </li>
        <li>
          <b>Intent</b> <span className="eh-muted">TF-IDF + logistic regression (scikit-learn)</span>
          <p className="nlp-intent">
            {nlp.intent ?? "none (out of scope)"} <span>{percent(nlp.confidence)}</span>
            {others.map((t) => <small key={t.intent}>{t.intent} {percent(t.probability)}</small>)}
          </p>
        </li>
        <li>
          <b>Generated SPARQL</b> <span className="eh-muted">template checked with rdflib, run on Fuseki</span>
          {sparql ? <pre className="ask-sparql">{sparql}</pre> : <p className="eh-muted">No query was run.</p>}
        </li>
      </ol>
    </details>
  );
}

export default function AskFoods() {
  const [question, setQuestion] = useState("");
  const [examples, setExamples] = useState<string[]>([]);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
        Your question → spaCy finds the words and entities → scikit-learn finds the intent → SPARQL template →
        Fuseki runs it on the ontology → answer
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

          <NlpPanel nlp={result.nlp} sparql={result.sparql} />
        </div>
      )}
    </section>
  );
}
