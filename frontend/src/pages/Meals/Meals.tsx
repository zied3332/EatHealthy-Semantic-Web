// Meals page (module "Repas"): choose breakfast, lunch, dinner or snack, choose the foods, see the nutrient totals.
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Pencil, Plus, Trash2, UtensilsCrossed } from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import { errorMessage } from "../../services/aliments";
import { MEAL_TYPES, NUTRIENTS, deleteMeal, getMealFoods, getMeals, saveMeal, sumNutrients } from "../../services/meals";
import type { Meal, MealBody, MealFood, MealType, NutrientKey, Nutrients } from "../../services/meals";
import "../Foods/aliments.css";
import "./Meals.css";

const EMPTY: MealBody = { name: "", type: "Dejeuner", foods: [] };

function Totals({ values }: { values: Nutrients }) {
  return (
    <dl className="meal-totals">
      {(Object.keys(NUTRIENTS) as NutrientKey[]).map((key) => (
        <div key={key}>
          <dt>{NUTRIENTS[key][0]}</dt>
          <dd>{values[key] ?? 0} <small>{NUTRIENTS[key][1]}</small></dd>
        </div>
      ))}
    </dl>
  );
}

export default function Meals() {
  const { user } = useAuth();
  const [meals, setMeals] = useState<Meal[] | null>(null);   // null = still loading
  const [foods, setFoods] = useState<MealFood[]>([]);
  const [form, setForm] = useState<MealBody>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    getMeals().then(setMeals).catch(() => setError("Unable to load the meals from Fuseki."));
    getMealFoods().then(setFoods).catch(() => setFoods([]));
  }, [reload]);

  const chosen = foods.filter((f) => form.foods.includes(f.id));

  function toggle(id: string) {
    setForm({ ...form, foods: form.foods.includes(id) ? form.foods.filter((f) => f !== id) : [...form.foods, id] });
  }

  function edit(meal: Meal) {
    setEditing(meal.id);
    setForm({ name: meal.name, type: meal.type, foods: meal.foods.map((f) => f.id) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancel() {
    setEditing(null);
    setForm(EMPTY);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await saveMeal({ ...form, name: form.name.trim() }, editing ?? undefined);
      cancel();
      setReload((n) => n + 1);
    } catch (err) {
      setError(errorMessage(err, "The meal could not be saved."));
    }
  }

  async function remove(meal: Meal) {
    if (!window.confirm(`Delete the meal "${meal.name}"? The foods are kept.`)) return;
    setError(null);
    try {
      await deleteMeal(meal.id);
      setReload((n) => n + 1);
    } catch (err) {
      setError(errorMessage(err, "The meal could not be deleted."));
    }
  }

  return (
    <main className="impacts-page">
      <header className="impacts-header">
        <div>
          <span className="impacts-eyebrow"><UtensilsCrossed size={15} /> MEALS</span>
          <h1>Build a meal</h1>
          <p>Choose breakfast, lunch, dinner or snack, then the foods. The totals add the nutrients of each food
            (per 100 g). Saved in the ontology as eh:Repas with eh:contientAliment.</p>
        </div>
      </header>

      {error && <div className="eh-error" role="alert">{error}</div>}

      <form className="impacts-add" onSubmit={submit}>
        <h2>{editing ? <><Pencil size={18} /> Edit the meal</> : <><Plus size={18} /> New meal</>}</h2>
        <div className="impacts-add-fields">
          <label className="impacts-source">
            Name
            <input required minLength={2} maxLength={60} value={form.name} placeholder="Mon déjeuner"
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            Meal
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as MealType })}>
              {(Object.keys(MEAL_TYPES) as MealType[]).map((t) => <option key={t} value={t}>{MEAL_TYPES[t]}</option>)}
            </select>
          </label>
        </div>

        <p className="eh-muted">Foods ({form.foods.length} chosen)</p>
        <div className="meal-foods">
          {foods.map((f) => (
            <label key={f.id} className={`meal-food ${form.foods.includes(f.id) ? "chosen" : ""}`}>
              <input type="checkbox" checked={form.foods.includes(f.id)} onChange={() => toggle(f.id)} />
              {f.label}
              <small>{f.calories ?? "?"} kcal · {f.glucides ?? "?"} g carbs</small>
            </label>
          ))}
        </div>

        <Totals values={sumNutrients(chosen)} />
        <div className="meal-buttons">
          <button type="submit" className="eh-button" disabled={form.foods.length === 0}>
            {editing ? "Save changes" : "Create meal"}
          </button>
          {editing && <button type="button" className="eh-button secondary" onClick={cancel}>Cancel</button>}
        </div>
      </form>

      <section className="meal-list">
        {meals === null && <p className="eh-muted">Loading…</p>}
        {meals?.length === 0 && <p className="eh-muted">No meals yet. Create the first one above.</p>}
        {meals?.map((meal) => (
          <article key={meal.id} className="impacts-card meal-card">
            <div className="meal-card-head">
              <div>
                <span className="eh-badge low">{MEAL_TYPES[meal.type]}</span>
                {meal.mine && <span className="eh-badge medium">Mine</span>}
                <h3>{meal.name}</h3>
              </div>
              {(meal.mine || user?.role === "admin") && (
                <div className="impacts-actions">
                  <button type="button" className="eh-button secondary" onClick={() => edit(meal)}><Pencil size={14} /> Edit</button>
                  <button type="button" className="eh-button danger" onClick={() => void remove(meal)}><Trash2 size={14} /> Delete</button>
                </div>
              )}
            </div>
            <p className="eh-muted">{meal.foods.map((f) => f.label).join(", ") || "No foods"}</p>
            <Totals values={meal.totals} />
          </article>
        ))}
      </section>
    </main>
  );
}
