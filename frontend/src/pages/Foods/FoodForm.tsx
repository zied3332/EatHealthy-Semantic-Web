// Add / edit food form (modal), used by the Food Explorer and the food page.
import { useState } from "react";
import type { FormEvent } from "react";
import { X } from "lucide-react";

import { CATEGORY_LABELS, errorMessage, saveFood } from "../../services/aliments";
import type { FoodSummary } from "../../services/aliments";
import "./aliments.css";

interface Props {
  food?: Partial<FoodSummary> & { name: string };   // the food to edit; empty = create
  onClose: () => void;
  onSaved: (id: string) => void;
}

export default function FoodForm({ food, onClose, onSaved }: Props) {
  const initial = {
    name: food?.label ?? "",
    category: food?.category ?? "Fruit",
    calories: food?.calories?.toString() ?? "",
    price: food?.price?.toString() ?? "",
    organic: food?.organic ?? false,
    local: food?.local ?? false,
  };
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      category: form.category,
      calories: form.calories === "" ? undefined : Number(form.calories),
      price: form.price === "" ? undefined : Number(form.price),
      organic: form.organic,
      local: form.local,
    };
    if (food) {   // when editing, send only what changed
      for (const key of Object.keys(body) as (keyof typeof initial)[]) {
        if (String(form[key]).trim() === String(initial[key])) delete body[key];
      }
    }
    setSaving(true);
    try {
      onSaved(await saveFood(body, food?.name));
    } catch (err) {
      setError(errorMessage(err, "The food could not be saved."));
      setSaving(false);
    }
  }

  return (
    <div className="eh-modal-backdrop" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <form className="eh-modal" role="dialog" aria-modal="true" aria-label="Food form" onSubmit={submit}>
        <div className="eh-modal-header">
          <h2>{food ? `Edit ${food.label ?? food.name}` : "Add food"}</h2>
          <button type="button" className="eh-icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <label>
          Name
          <input autoFocus required minLength={2} maxLength={60} value={form.name}
            placeholder="Datte Deglet Nour" onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          Category
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
              <option key={id} value={id}>{label} ({id})</option>
            ))}
          </select>
        </label>
        <div className="eh-form-row">
          <label>
            Calories (kcal/100 g)
            <input type="number" required={!food} min={0} max={900} step="any" value={form.calories}
              onChange={(e) => setForm({ ...form, calories: e.target.value })} />
          </label>
          <label>
            Price (optional)
            <input type="number" min={0.01} step="any" value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </label>
        </div>
        <div className="eh-form-row">
          <label className="eh-check">
            <input type="checkbox" checked={form.organic} onChange={(e) => setForm({ ...form, organic: e.target.checked })} />
            Organic
          </label>
          <label className="eh-check">
            <input type="checkbox" checked={form.local} onChange={(e) => setForm({ ...form, local: e.target.checked })} />
            Local
          </label>
        </div>

        {error && <div className="eh-error" role="alert">{error}</div>}

        <div className="eh-modal-actions">
          <button type="button" className="eh-button secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="eh-button" disabled={saving}>
            {saving ? "Saving…" : food ? "Save changes" : "Create food"}
          </button>
        </div>
      </form>
    </div>
  );
}
