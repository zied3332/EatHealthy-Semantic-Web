

import { useEffect, useMemo, useRef, useState } from "react";

import type { CSSProperties } from "react";

import {

  Activity,

  AlertCircle,

  ArrowRight,

  BarChart3,

  BrainCircuit,

  Check,

  CheckCircle2,

  ChevronDown,

  ChevronUp,

  Code2,

  Copy,

  Database,

  Info,

  Leaf,

  ListFilter,

  LoaderCircle,

  MessageSquareText,

  Search,

  Sparkles,

  Table2,

  Trophy,

  Utensils,
  RefreshCw,
  Sun,
  Moon,
  Coffee,

  XCircle,

  LayoutGrid,

} from "lucide-react";

import "./SemanticSearch.css";

const API_BASE_URL = (

  import.meta.env.VITE_API_URL || "http://localhost:8000"

).replace(/\/$/, "");

const EXAMPLES = [
  {
    label: "Planifier ma journée",
    question: "Propose-moi un menu pour une journée afin de perdre du poids",
  },

  {

    label: "Riches en protéines",

    question: "Quels aliments sont riches en protéines ?",

  },

  {

    label: "Peu de sucre",

    question: "Quels aliments contiennent peu de sucre ?",

  },

  {

    label: "Calories et fibres",

    question:

      "Quels aliments sont faibles en calories et riches en fibres ?",

  },

  {

    label: "Compter les fruits",

    question: "Combien de fruits y a-t-il ?",

  },

  {

    label: "Comparer",

    question: "Compare la pomme et la banane",

  },

  {

    label: "Empreinte carbone",

    question: "Quels aliments ont une faible empreinte carbone ?",

  },

  {

    label: "Repas",

    question: "Quels aliments contient le dîner ?",

  },

];

type ResultValue = string | number | boolean | null;

type Row = Record<string, ResultValue>;

type DisplayMode = "cards" | "chart" | "table";

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

  results: Row[];

  count: number;

  answer?: string | null;

  confidence?: number | null;

  boolean?: boolean | null;

}

interface MealOption {
  id: string;
  foods: string[];
}

interface MealGroup {
  type: string;
  label: string;
  icon?: string;
  options: MealOption[];
  count?: number;
}

interface MealPlanResponse {
  objective?: string;
  title?: string;
  description?: string;
  meals: MealGroup[];
  total_options?: number;
  source?: string;
  disclaimer?: string;
}

function isMealPlanQuestion(question: string): boolean {
  const normalized = question
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const wantsPlan = /\b(propose|proposer|suggere|suggerer|compose|composer|prepare|preparer|planifie|planifier|menu|menus|repas equilibre|repas pour|journee alimentaire|plan alimentaire)\b/.test(normalized);
  const mentionsMeals = /\b(menu|menus|repas|petit.dejeuner|dejeuner|diner|journee|jour|alimentation)\b/.test(normalized);
  return wantsPlan && mentionsMeals;
}

function MealPlanner({ plan }: { plan: MealPlanResponse }) {
  const [selected, setSelected] = useState<Record<string, number>>({});

  function rotate(type: string, count: number) {
    if (count < 2) return;
    setSelected((previous) => ({
      ...previous,
      [type]: ((previous[type] ?? 0) + 1) % count,
    }));
  }

  const icons = [Coffee, Sun, Moon];

  return (
    <section className="semantic-meal-planner semantic-results-enter">
      <div className="semantic-results-heading">
        <div>
          <span className="semantic-eyebrow">PLANIFICATION À PARTIR DE L'ONTOLOGIE</span>
          <h2>{plan.title || "Suggestions de repas pour votre journée"}</h2>
        </div>
        <span className="semantic-preview-badge"><CheckCircle2 size={15} /> Données Fuseki</span>
      </div>
      {plan.description && <p className="semantic-meal-description">{plan.description}</p>}
      <div className="semantic-meal-grid">
        {(plan.meals || []).map((meal, index) => {
          const options = meal.options || [];
          const selectedIndex = (selected[meal.type] ?? 0) % Math.max(options.length, 1);
          const option = options[selectedIndex];
          const Icon = icons[index] || Utensils;
          return (
            <article className="semantic-meal-card semantic-reveal-item" style={revealStyle(index)} key={meal.type}>
              <div className="semantic-meal-card-header">
                <span className="semantic-meal-icon"><Icon size={23} /></span>
                <div>
                  <span className="semantic-eyebrow">REPAS {index + 1}</span>
                  <h3>{meal.label || prettyName(meal.type)}</h3>
                </div>
              </div>
              {option ? (
                <>
                  <ul className="semantic-meal-foods">
                    {option.foods.map((food, foodIndex) => (
                      <li key={`${option.id}-${foodIndex}`}><Leaf size={16} />{prettyName(food)}</li>
                    ))}
                  </ul>
                  <div className="semantic-meal-footer">
                    <span>Suggestion {selectedIndex + 1} / {options.length}</span>
                    <button type="button" disabled={options.length < 2} onClick={() => rotate(meal.type, options.length)}>
                      <RefreshCw size={16} /> Autre suggestion
                    </button>
                  </div>
                </>
              ) : <p className="semantic-empty">Aucune suggestion disponible.</p>}
            </article>
          );
        })}
      </div>
      <p className="semantic-meal-disclaimer"><Info size={17} />{plan.disclaimer || "Suggestions expérimentales basées sur les relations RDF. Les portions et apports nutritionnels ne sont pas vérifiés."}</p>
      <p className="semantic-meal-source">Source : {plan.source || "Apache Jena Fuseki"} · {plan.total_options ?? plan.meals.reduce((sum, meal) => sum + (meal.options?.length || 0), 0)} suggestions disponibles</p>
    </section>
  );
}

const INTENT_LABELS: Record<string, string> = {

  count: "Comptage",

  list: "Recherche d'aliments",

  value: "Valeur nutritionnelle",

  extreme: "Valeur extrême",

  ranking: "Classement",

  compare: "Comparaison",

  average: "Moyenne",

  yes_no: "Vérification",

  details: "Fiche détaillée",

  meal_total: "Bilan du repas",

  meal_foods: "Composition du repas",

};

const FIELD_LABELS: Record<string, string> = {

  aliment: "Aliment",

  nom: "Nom",

  categorie: "Catégorie",

  nombre: "Nombre",

  calories: "Calories",

  fibres: "Fibres",

  glucides: "Glucides",

  proteines: "Protéines",

  lipides: "Lipides",

  sucre: "Sucre",

  sodium: "Sodium",

  prix: "Prix",

  co2: "Empreinte carbone",

  eau: "Empreinte eau",

  valeur: "Valeur",

  moyenne: "Moyenne",

  impact: "Impact",

  estBio: "Bio",

  estLocal: "Local",

};

const ANALYSIS_STEPS = [

  {

    title: "Analyse linguistique",

    detail: "Identification de la question et de son intention",

  },

  {

    title: "Interprétation sémantique",

    detail: "Reconnaissance des entités et des critères",

  },

  {

    title: "Interrogation du graphe RDF",

    detail: "Génération SPARQL et recherche dans Fuseki",

  },

  {

    title: "Préparation de la réponse",

    detail: "Organisation et visualisation des résultats",

  },

];

function formatValue(value: ResultValue): string {

  if (value === null || value === undefined) return "—";

  if (typeof value === "boolean") return value ? "Oui" : "Non";

  const text = String(value);

  if (text.includes("#")) return text.split("#").pop() || text;

  if (text.startsWith("http")) return text.split("/").pop() || text;

  return text;

}

function prettyName(value: ResultValue): string {

  return formatValue(value)

    .replace(/([a-zà-ÿ])([A-Z])/g, "$1 $2")

    .replace(/_/g, " ");

}

function formatField(field: string): string {

  return (

    FIELD_LABELS[field] ||

    field

      .replace(/^total_/, "Total ")

      .replace(/^moyenne_/, "Moyenne ")

      .replace(/([a-z])([A-Z])/g, "$1 $2")

      .replace(/_/g, " ")

  );

}

function getNumber(value: ResultValue): number | null {

  if (typeof value === "number" && Number.isFinite(value)) {

    return value;

  }

  if (typeof value === "string" && value.trim()) {

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;

  }

  return null;

}

function formatNumber(value: number): string {

  return value.toLocaleString("fr-FR", {

    maximumFractionDigits: 2,

  });

}

function getColumns(rows: Row[]): string[] {

  return Array.from(

    new Set(rows.flatMap((row) => Object.keys(row)))

  );

}

function getNumericColumns(rows: Row[]): string[] {

  const ignored = new Set(["id", "annee", "year"]);

  return getColumns(rows).filter(

    (column) =>

      !ignored.has(column) &&

      rows.some((row) => getNumber(row[column]) !== null)

  );

}

function getNameField(row: Row): string | null {

  const preferred = [

    "nom",

    "aliment",

    "food",

    "label",

    "categorie",

    "repas",

    "personne",

    "utilisateur",

    "name",

  ];

  for (const field of preferred) {

    if (

      row[field] !== null &&

      row[field] !== undefined &&

      row[field] !== ""

    ) {

      return field;

    }

  }

  return (

    Object.keys(row).find(

      (field) =>

        typeof row[field] === "string" &&

        getNumber(row[field]) === null

    ) || null

  );

}

function getTitle(row: Row, index: number): string {

  const nameField = getNameField(row);

  return nameField

    ? prettyName(row[nameField])

    : `Résultat ${index + 1}`;

}

function getAttributes(row: Row): [string, ResultValue][] {

  const nameField = getNameField(row);

  return Object.entries(row).filter(

    ([key, value]) =>

      key !== nameField &&

      key !== "nom" &&

      value !== null &&

      value !== undefined

  );

}

function getEntityLabels(

  entities: SearchResult["entities"]

): string[] {

  if (Array.isArray(entities)) {

    return entities.map(

      (entity) => entity.text || entity.id || "Entité"

    );

  }

  return [

    entities?.label,

    entities?.secondary_label,

  ].filter((value): value is string => Boolean(value));

}

function getErrorMessage(

  status: number,

  detail: unknown

): string {

  if (typeof detail === "string") return detail;

  if (status === 422) {

    return "Question non reconnue. Essayez une autre formulation.";

  }

  if (status === 502) {

    return "Impossible de communiquer avec Apache Jena Fuseki.";

  }

  return `La recherche a échoué (HTTP ${status}).`;

}

function defaultMode(result: SearchResult): DisplayMode {

  if (

    ["ranking", "compare", "average", "meal_total"].includes(

      result.intent

    ) &&

    getNumericColumns(result.results).length > 0

  ) {

    return "chart";

  }

  return "cards";

}

function revealStyle(index: number): CSSProperties {

  return {

    animationDelay: `${Math.min(index, 18) * 90}ms`,

  };

}

function AnalysisProgress({

  step,

  complete,

}: {

  step: number;

  complete: boolean;

}) {

  return (

    <section

      className="semantic-thinking-panel"

      role="status"

      aria-live="polite"

    >

      <div className="semantic-thinking-heading">

        <div className="semantic-thinking-orb">

          {complete ? (

            <CheckCircle2 size={26} />

          ) : (

            <BrainCircuit size={27} />

          )}

        </div>

        <div>

          <span className="semantic-eyebrow">

            INTELLIGENCE SÉMANTIQUE

          </span>

          <h3>

            {complete

              ? "Analyse terminée"

              : "EatHealthy traite votre question"}

          </h3>

          <p>

            {complete

              ? "Les données ont été récupérées et préparées."

              : "Recherche en cours dans la base de connaissances"}

          </p>

        </div>

        {!complete && (

          <LoaderCircle

            className="semantic-spin semantic-thinking-spinner"

            size={22}

          />

        )}

      </div>

      <div className="semantic-thinking-steps">

        {ANALYSIS_STEPS.map((item, index) => {

          const done = complete || index < step;

          const active = !complete && index === step;

          return (

            <div

              key={item.title}

              className={[

                "semantic-thinking-step",

                done ? "is-done" : "",

                active ? "is-active" : "",

              ].join(" ")}

            >

              <div className="semantic-step-indicator">

                {done ? (

                  <Check size={15} />

                ) : active ? (

                  <LoaderCircle

                    size={15}

                    className="semantic-spin"

                  />

                ) : (

                  <span>{index + 1}</span>

                )}

              </div>

              <div>

                <strong>{item.title}</strong>

                <span>{item.detail}</span>

              </div>

            </div>

          );

        })}

      </div>

      {!complete && (

        <div className="semantic-thinking-progress">

          <div

            style={{

              width: `${Math.min((step + 1) * 24, 88)}%`,

            }}

          />

        </div>

      )}

    </section>

  );

}

function ResultCards({ rows }: { rows: Row[] }) {

  return (

    <div className="semantic-food-grid">

      {rows.map((row, index) => (

        <article

          className="semantic-food-card semantic-reveal-item"

          style={revealStyle(index)}

          key={index}

        >

          <div className="semantic-food-icon">

            <Leaf size={19} />

          </div>

          <strong>{getTitle(row, index)}</strong>

          <div className="semantic-food-attributes">

            {getAttributes(row)

              .slice(0, 6)

              .map(([key, value]) => (

                <span key={key}>

                  {formatField(key)} :{" "}

                  <b>{formatValue(value)}</b>

                </span>

              ))}

          </div>

        </article>

      ))}

    </div>

  );

}

function ResultChart({ rows }: { rows: Row[] }) {

  const numericColumns = getNumericColumns(rows);

  const [metric, setMetric] = useState(

    numericColumns[0] || ""

  );

  useEffect(() => {

    if (!numericColumns.includes(metric)) {

      setMetric(numericColumns[0] || "");

    }

  }, [metric, numericColumns.join("|")]);

  if (!numericColumns.length) {

    return (

      <div className="semantic-empty-state">

        <BarChart3 size={30} />

        <h4>Graphique indisponible</h4>

        <p>

          Cette réponse ne contient aucune valeur numérique

          exploitable.

        </p>

      </div>

    );

  }

  const selectedMetric = numericColumns.includes(metric)

    ? metric

    : numericColumns[0];

  const chartRows = rows

    .map((row, index) => ({

      name: getTitle(row, index),

      value: getNumber(row[selectedMetric]),

    }))

    .filter(

      (item): item is { name: string; value: number } =>

        item.value !== null

    )

    .slice(0, 20);

  const maximum = Math.max(

    0,

    ...chartRows.map((item) => item.value)

  );

  const minimum = Math.min(

    0,

    ...chartRows.map((item) => item.value)

  );

  const range = maximum - minimum || 1;

  return (

    <div className="semantic-chart-panel">

      <div className="semantic-chart-heading">

        <div>

          <span className="semantic-eyebrow">

            VISUALISATION DES DONNÉES

          </span>

          <h3>{formatField(selectedMetric)}</h3>

        </div>

        {numericColumns.length > 1 && (

          <label className="semantic-chart-select">

            <span>Indicateur</span>

            <select

              value={selectedMetric}

              onChange={(event) =>

                setMetric(event.target.value)

              }

            >

              {numericColumns.map((column) => (

                <option key={column} value={column}>

                  {formatField(column)}

                </option>

              ))}

            </select>

          </label>

        )}

      </div>

      <div

        className="semantic-chart-list"

        role="img"

        aria-label={`Graphique de ${formatField(selectedMetric)}`}

      >

        {chartRows.map((item, index) => {

          const isNegative = item.value < 0;

          const width =

            Math.abs(item.value) / range * 100;

          const zeroPosition =

            (-minimum / range) * 100;

          return (

            <div

              className="semantic-chart-row semantic-reveal-item"

              style={revealStyle(index)}

              key={`${item.name}-${index}`}

            >

              <span

                className="semantic-chart-name"

                title={item.name}

              >

                {item.name}

              </span>

              <div className="semantic-chart-track">

                <div

                  className="semantic-chart-zero"

                  style={{ left: `${zeroPosition}%` }}

                />

                <div

                  className={`semantic-chart-bar ${

                    isNegative ? "is-negative" : ""

                  }`}

                  style={{

                    left: isNegative

                      ? `${zeroPosition - width}%`

                      : `${zeroPosition}%`,

                    width: `${width}%`,

                    animationDelay: `${index * 90}ms`,

                  }}

                />

              </div>

              <strong className="semantic-chart-value">

                {formatNumber(item.value)}

              </strong>

            </div>

          );

        })}

      </div>

      <p className="semantic-chart-caption">

        Valeurs issues de Fuseki. Les unités et la base

        nutritionnelle dépendent des données de l'ontologie.

      </p>

    </div>

  );

}

function ResultTable({ rows }: { rows: Row[] }) {

  const columns = getColumns(rows);

  if (!rows.length) {

    return <p className="semantic-empty">Aucune donnée.</p>;

  }

  return (

    <div className="semantic-table-wrapper">

      <table className="semantic-table semantic-display-table">

        <thead>

          <tr>

            <th>#</th>

            {columns.map((column) => (

              <th key={column}>

                {formatField(column)}

              </th>

            ))}

          </tr>

        </thead>

        <tbody>

          {rows.map((row, index) => (

            <tr

              key={index}

              className="semantic-reveal-item"

              style={revealStyle(index)}

            >

              <td>{index + 1}</td>

              {columns.map((column) => (

                <td key={column}>

                  {formatValue(row[column])}

                </td>

              ))}

            </tr>

          ))}

        </tbody>

      </table>

    </div>

  );

}

function DisplaySelector({

  mode,

  onChange,

  hasChart,

}: {

  mode: DisplayMode;

  onChange: (mode: DisplayMode) => void;

  hasChart: boolean;

}) {

  return (

    <div

      className="semantic-display-selector"

      role="group"

      aria-label="Mode d'affichage"

    >

      <button

        type="button"

        className={mode === "cards" ? "is-selected" : ""}

        aria-pressed={mode === "cards"}

        onClick={() => onChange("cards")}

      >

        <LayoutGrid size={17} />

        Cartes

      </button>

      <button

        type="button"

        className={mode === "chart" ? "is-selected" : ""}

        aria-pressed={mode === "chart"}

        disabled={!hasChart}

        onClick={() => onChange("chart")}

      >

        <BarChart3 size={17} />

        Graphique

      </button>

      <button

        type="button"

        className={mode === "table" ? "is-selected" : ""}

        aria-pressed={mode === "table"}

        onClick={() => onChange("table")}

      >

        <Table2 size={17} />

        Tableau

      </button>

    </div>

  );

}

function AnswerRenderer({

  result,

}: {

  result: SearchResult;

}) {

  const rows = result.results || [];

  const intent = result.intent;

  const entities = getEntityLabels(result.entities);

  const first = rows[0];

  const [mode, setMode] = useState<DisplayMode>(

    defaultMode(result)

  );

  const numericColumns = useMemo(

    () => getNumericColumns(rows),

    [rows]

  );

  if (intent === "count") {

    const count = first

      ? getNumber(first.nombre ?? first.count ?? null)

      : null;

    const total = count ?? result.count;

    return (

      <div className="semantic-answer-highlight semantic-reveal-item">

        <span className="semantic-answer-eyebrow">

          RÉSULTAT DU COMPTAGE

        </span>

        <div className="semantic-big-number">

          {formatNumber(total)}

        </div>

        <h3>

          {entities[0]

            ? `${entities[0]} dans la base de connaissances`

            : "Éléments trouvés"}

        </h3>

        <p>

          {total} élément{total !== 1 ? "s" : ""} identifié

          {total !== 1 ? "s" : ""} dans l'ontologie.

        </p>

      </div>

    );

  }

  if (intent === "yes_no") {

    const raw =

      result.boolean ??

      (first

        ? first.resultat ??

          first.reponse ??

          first.valeur

        : null);

    const value =

      typeof raw === "boolean"

        ? raw

        : typeof raw === "string" &&

          ["true", "false"].includes(raw.toLowerCase())

        ? raw.toLowerCase() === "true"

        : null;

    if (value !== null) {

      return (

        <div

          className={`semantic-boolean-answer semantic-reveal-item ${

            value ? "is-yes" : "is-no"

          }`}

        >

          {value ? (

            <CheckCircle2 size={38} />

          ) : (

            <XCircle size={38} />

          )}

          <div>

            <span className="semantic-answer-eyebrow">

              RÉPONSE

            </span>

            <h3>{value ? "Oui" : "Non"}</h3>

            <p>

              {result.answer ||

                "Réponse obtenue à partir du graphe RDF."}

            </p>

          </div>

        </div>

      );

    }

  }

  if (!rows.length) {

    return (

      <div className="semantic-empty-state">

        <Search size={30} />

        <h4>Aucun résultat trouvé</h4>

        <p>

          La requête a été exécutée, mais aucune donnée

          ne correspond aux critères.

        </p>

      </div>

    );

  }

  const showMetric =

    (intent === "value" || intent === "extreme") &&

    rows.length === 1;

  if (showMetric) {

    const numericField = numericColumns[0];

    const number = numericField

      ? getNumber(first[numericField])

      : null;

    return (

      <div className="semantic-metric-layout semantic-reveal-item">

        <div className="semantic-metric-main">

          <span className="semantic-answer-eyebrow">

            {intent === "extreme"

              ? "VALEUR EXTRÊME"

              : "VALEUR NUTRITIONNELLE"}

          </span>

          <div className="semantic-metric-value">

            {number !== null

              ? formatNumber(number)

              : getTitle(first, 0)}

          </div>

          <h3>

            {numericField

              ? formatField(numericField)

              : "Résultat"}

          </h3>

          <p>{getTitle(first, 0)}</p>

        </div>

        <div className="semantic-metric-side">

          {getAttributes(first).map(([key, value]) => (

            <div className="semantic-mini-row" key={key}>

              <strong>{formatField(key)}</strong>

              <span>{formatValue(value)}</span>

            </div>

          ))}

        </div>

      </div>

    );

  }

  const subtitle =

    intent === "ranking"

      ? "Classement des aliments"

      : intent === "compare"

      ? "Comparaison des aliments"

      : intent === "meal_total"

      ? "Bilan nutritionnel"

      : intent === "meal_foods"

      ? "Composition du repas"

      : intent === "average"

      ? "Valeurs moyennes"

      : `${rows.length} résultat${

          rows.length > 1 ? "s" : ""

        } trouvé${rows.length > 1 ? "s" : ""}`;

  return (

    <div className="semantic-visual-results">

      <div className="semantic-visual-toolbar">

        <div className="semantic-answer-subtitle">

          {intent === "ranking" ? (

            <Trophy size={20} />

          ) : intent.startsWith("meal") ? (

            <Utensils size={20} />

          ) : intent === "details" ? (

            <Activity size={20} />

          ) : (

            <ListFilter size={20} />

          )}

          <span>{subtitle}</span>

        </div>

        <DisplaySelector

          mode={mode}

          onChange={setMode}

          hasChart={numericColumns.length > 0}

        />

      </div>

      <div

        className="semantic-display-content"

        key={mode}

      >

        {mode === "chart" ? (

          <ResultChart rows={rows} />

        ) : mode === "table" ? (

          <ResultTable rows={rows} />

        ) : (

          <ResultCards rows={rows} />

        )}

      </div>

    </div>

  );

}

export default function SemanticSearch() {

  const [question, setQuestion] = useState("");

  const [result, setResult] =

    useState<SearchResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [mealPlan, setMealPlan] = useState<MealPlanResponse | null>(null);

  const [thinkingStep, setThinkingStep] = useState(0);

  const [showSparql, setShowSparql] = useState(false);

  const [showRawData, setShowRawData] = useState(false);

  const [copied, setCopied] = useState(false);

  const [error, setError] =

    useState<string | null>(null);

  const requestController =

    useRef<AbortController | null>(null);

  useEffect(() => {

    return () => {

      requestController.current?.abort();

    };

  }, []);

  useEffect(() => {

    if (!loading) return;

    // Visual progress only. The request itself determines

    // when the final result can appear.

    setThinkingStep(0);

    const timers = [

      window.setTimeout(() => setThinkingStep(1), 650),

      window.setTimeout(() => setThinkingStep(2), 1450),

    ];

    return () => {

      timers.forEach(window.clearTimeout);

    };

  }, [loading]);

  async function handleSearch() {

    const text = question.trim();

    if (!text || loading) return;

    requestController.current?.abort();

    const controller = new AbortController();

    requestController.current = controller;

    setLoading(true);

    setThinkingStep(0);


    setError(null);

    setCopied(false);

    setShowSparql(false);

    setShowRawData(false);

    try {

      const mealPlanRequested = isMealPlanQuestion(text);
      const response = await fetch(
        mealPlanRequested
          ? `${API_BASE_URL}/api/nlp/meal-plan`
          : `${API_BASE_URL}/api/nlp/query`,
        mealPlanRequested
          ? { method: "GET", signal: controller.signal }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ question: text }),
              signal: controller.signal,
            }
      );

      const data = await response.json();

      if (!response.ok) {

        throw new Error(

          getErrorMessage(response.status, data.detail)

        );

      }

      if (controller.signal.aborted) return;

      // Only the actual API response unlocks the results.

      if (mealPlanRequested) {
        if (!Array.isArray(data.meals)) {
          throw new Error("Réponse de planification invalide.");
        }
        setResult(null);
        setMealPlan(data as MealPlanResponse);
      } else {
        setMealPlan(null);
        setResult(data as SearchResult);
      }
      setThinkingStep(3);

    } catch (err) {

      if (controller.signal.aborted) return;

      setError(

        err instanceof Error

          ? err.message

          : "Une erreur inattendue est survenue."

      );

    } finally {

      if (!controller.signal.aborted) {

        setLoading(false);

      }

    }

  }

  async function handleCopy() {

    if (!result?.sparql) return;

    try {

      await navigator.clipboard.writeText(

        result.sparql

      );

      setCopied(true);

      window.setTimeout(

        () => setCopied(false),

        2000

      );

    } catch {

      setError(

        "Impossible de copier la requête SPARQL."

      );

    }

  }

  const entityLabels = result

    ? getEntityLabels(result.entities)

    : [];

  const columns = result

    ? getColumns(result.results || [])

    : [];

  const confidence =

    typeof result?.confidence === "number"

      ? `${(result.confidence * 100).toFixed(1)}%`

      : null;

  return (

    <div className="semantic-page">

      <header className="semantic-hero">

        <div className="semantic-hero-icon">

          <BrainCircuit size={30} />

        </div>

        <div className="semantic-hero-content">

          <span className="semantic-eyebrow">

            EATHEALTHY · INTELLIGENCE SÉMANTIQUE

          </span>

          <h1>

            Explorez vos données en langage naturel

          </h1>

          <p>

            Posez une question en français. EatHealthy

            analyse votre intention, interroge son

            ontologie RDF et visualise les résultats.

          </p>

        </div>

      </header>

      {loading && (

        <AnalysisProgress

          step={thinkingStep}

          complete={false}

        />

      )}

      {mealPlan && !loading && <MealPlanner plan={mealPlan} />}

      {result && !loading && (

        <section className="semantic-results semantic-results-enter">

          <div className="semantic-results-heading">

            <div>

              <span className="semantic-eyebrow">

                RÉSULTAT DE L'ANALYSE

              </span>

              <h2>Votre réponse</h2>

            </div>

            <span className="semantic-preview-badge">

              <CheckCircle2 size={15} />

              Données Fuseki

            </span>

          </div>

          <div className="semantic-answer-card">

            <div className="semantic-answer-header">

              <div className="semantic-answer-header-icon">

                <MessageSquareText size={23} />

              </div>

              <div>

                <span>QUESTION ANALYSÉE</span>

                <h3>

                  {result.question || question}

                </h3>

              </div>

            </div>

            <AnswerRenderer result={result} />

            {result.answer &&

              !["yes_no", "value", "extreme"].includes(

                result.intent

              ) && (

                <p className="semantic-generated-answer semantic-reveal-item">

                  <Sparkles size={16} />

                  {result.answer}

                </p>

              )}

          </div>

          <div className="semantic-analysis-strip">

            <div>

              <span>INTENTION DÉTECTÉE</span>

              <strong>

                {INTENT_LABELS[result.intent] ||

                  result.intent}

              </strong>

            </div>

            <div>

              <span>DOMAINE</span>

              <strong>

                {result.domain === "food_nutrition"

                  ? "Alimentation & nutrition"

                  : "Recherche sémantique"}

              </strong>

            </div>

            {confidence && (

              <div>

                <span>CONFIANCE DU CLASSIFIEUR</span>

                <strong>{confidence}</strong>

              </div>

            )}

            {entityLabels.length > 0 && (

              <div>

                <span>ENTITÉS RECONNUES</span>

                <strong>

                  {entityLabels.join(" · ")}

                </strong>

              </div>

            )}

          </div>

          <div className="semantic-code-card semantic-collapsible-card">

            <button

              type="button"

              className="semantic-collapse-trigger"

              aria-expanded={showSparql}

              onClick={() =>

                setShowSparql(!showSparql)

              }

            >

              <span>

                <Code2 size={21} />

                <strong>

                  Voir la requête SPARQL générée

                </strong>

              </span>

              {showSparql ? (

                <ChevronUp size={20} />

              ) : (

                <ChevronDown size={20} />

              )}

            </button>

            {showSparql && (

              <div className="semantic-collapsible-content">

                <div className="semantic-code-actions">

                  <span>

                    Requête exécutée sur Fuseki

                  </span>

                  <button

                    type="button"

                    onClick={() =>

                      void handleCopy()

                    }

                  >

                    {copied ? (

                      <Check size={16} />

                    ) : (

                      <Copy size={16} />

                    )}

                    {copied

                      ? "Copié"

                      : "Copier"}

                  </button>

                </div>

                <pre>

                  <code>{result.sparql}</code>

                </pre>

              </div>

            )}

          </div>

          <div className="semantic-data-card semantic-collapsible-card">

            <button

              type="button"

              className="semantic-collapse-trigger"

              aria-expanded={showRawData}

              onClick={() =>

                setShowRawData(!showRawData)

              }

            >

              <span>

                <Database size={21} />

                <strong>

                  Données brutes de la requête

                </strong>

                <small>

                  {result.results.length} ligne(s)

                </small>

              </span>

              {showRawData ? (

                <ChevronUp size={20} />

              ) : (

                <ChevronDown size={20} />

              )}

            </button>

            {showRawData && (

              <div className="semantic-collapsible-content">

                {result.results.length ? (

                  <div className="semantic-table-wrapper">

                    <table className="semantic-table">

                      <thead>

                        <tr>

                          {columns.map((column) => (

                            <th key={column}>

                              {formatField(column)}

                            </th>

                          ))}

                        </tr>

                      </thead>

                      <tbody>

                        {result.results.map(

                          (row, index) => (

                            <tr key={index}>

                              {columns.map(

                                (column) => (

                                  <td key={column}>

                                    {formatValue(

                                      row[column]

                                    )}

                                  </td>

                                )

                              )}

                            </tr>

                          )

                        )}

                      </tbody>

                    </table>

                  </div>

                ) : (

                  <p className="semantic-empty">

                    Aucune ligne retournée.

                  </p>

                )}

              </div>

            )}

          </div>

        </section>

      )}

      <section className="semantic-card">

        <div className="semantic-section-title">

          <MessageSquareText size={22} />

          <h2>Posez votre question</h2>

        </div>

        <label htmlFor="semantic-question">

          Votre question

        </label>

        <textarea

          id="semantic-question"

          value={question}

          onChange={(event) => {

            setQuestion(event.target.value);

            if (!loading) {

        
              setError(null);

            }

          }}

          placeholder="Ex. : Quels aliments sont riches en protéines ?"

          rows={3}

          disabled={loading}

          onKeyDown={(event) => {

            if (

              event.key === "Enter" &&

              (event.ctrlKey || event.metaKey)

            ) {

              event.preventDefault();

              void handleSearch();

            }

          }}

        />

        <div className="semantic-examples">

          <span>Essayez une question</span>

          <div className="semantic-example-list">

            {EXAMPLES.map((example) => (

              <button

                key={example.label}

                type="button"

                disabled={loading}

                onClick={() => {

                  setQuestion(example.question);

            
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

          onClick={() => void handleSearch()}

        >

          {loading ? (

            <LoaderCircle

              size={18}

              className="semantic-spin"

            />

          ) : (

            <Search size={18} />

          )}

          {loading

            ? "Analyse en cours..."

            : "Analyser la question"}

          {!loading && <ArrowRight size={17} />}

        </button>

        <p className="semantic-helper-text">

          <Info size={15} />

          spaCy + scikit-learn · SPARQL · Apache Jena Fuseki

        </p>

        {error && (

          <div

            className="semantic-error"

            role="alert"

          >

            <AlertCircle size={19} />

            <span>{error}</span>

          </div>

        )}

      </section>



    </div>

  );

}
