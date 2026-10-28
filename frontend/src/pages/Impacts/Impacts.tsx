// Environmental Impact page: CRUD of carbon and water footprints (ImpactEnvironnemental), like AdminUsers.
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { Leaf, Pencil, Plus, Trash2 } from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import {
  ADMIN_ONLY, DEFAULT_SOURCE, co2Badge, createImpact, deleteImpact,
  errorMessage, getFoods, getImpacts, updateImpact,
} from "../../services/aliments";
import type { FoodSummary, Impact, ImpactType } from "../../services/aliments";
import "../Foods/aliments.css";

export default function Impacts() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [type, setType] = useState<ImpactType>("EmpreinteCarbone");
  const [impacts, setImpacts] = useState<Impact[] | null>(null);   // null = still loading
  const [foods, setFoods] = useState<FoodSummary[]>([]);
  const [form, setForm] = useState({ food: "", value: "", source: DEFAULT_SOURCE });
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const carbon = type === "EmpreinteCarbone";
  const kind = carbon ? "carbon" : "water";

  // Load the ranking and the foods; again after each change or Carbon / Water toggle.
  useEffect(() => {
    getImpacts(type).then(setImpacts).catch(() => setError("Unable to load the impacts from Fuseki."));
    getFoods().then(setFoods).catch(() => setFoods([]));
  }, [type, reload]);

  // The "Add impact" select only shows foods that don't have this footprint yet.
  const freeFoods = foods.filter((f) => (carbon ? f.co2 : f.water) === null);
  const selected = freeFoods.some((f) => f.name === form.food) ? form.food : freeFoods[0]?.name ?? "";

  async function run(action: () => Promise<unknown>, failure: string) {
    setError(null);
    try {
      await action();
      setReload((n) => n + 1);
      return true;
    } catch (err) {
      setError(errorMessage(err, failure));
      return false;
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    const body = { food: selected, type, value: Number(form.value), source: form.source.trim() || DEFAULT_SOURCE };
    if (await run(() => createImpact(body), "The impact could not be added.")) setForm({ ...form, value: "" });
  }

  async function save(id: string, value: string) {
    if (await run(() => updateImpact(id, Number(value)), "The value could not be saved.")) setEditing(null);
  }

  async function remove(item: Impact) {
    if (!window.confirm(`Delete the ${kind} footprint of ${item.food_label ?? item.food}?`)) return;
    await run(() => deleteImpact(item.id), "The impact could not be deleted.");
  }

  return (
    <main className="impacts-page">
      <header className="impacts-header">
        <div>
          <span className="impacts-eyebrow"><Leaf size={15} /> ENVIRONMENTAL IMPACT</span>
          <h1>Food footprints</h1>
          <p>Per kg of food. Low carbon: ≤ 2 kg CO2e/kg (AlimentFaibleCarbone). High carbon: ≥ 10 (AlimentFortCarbone).
            Sustainable: low carbon and local (AlimentDurable).</p>
        </div>
        <div className="impacts-toggle" role="group" aria-label="Footprint type">
          {(["EmpreinteCarbone", "EmpreinteEau"] as const).map((t) => (
            <button type="button" key={t} className={type === t ? "active" : ""}
              onClick={() => { setType(t); setImpacts(null); setEditing(null); }}>
              {t === "EmpreinteCarbone" ? "Carbon" : "Water"}
            </button>
          ))}
        </div>
      </header>

      {error && <div className="eh-error" role="alert">{error}</div>}
      {!isAdmin && <p className="eh-admin-note">{ADMIN_ONLY}</p>}

      {isAdmin && (
        <form className="impacts-add" onSubmit={add}>
          <h2><Plus size={18} /> Add a {kind} footprint</h2>
          {freeFoods.length === 0 ? (
            <p className="eh-muted">All foods have a {kind} footprint. Add a new food first, or edit a value below.</p>
          ) : (
            <div className="impacts-add-fields">
              <label>
                Food
                <select value={selected} onChange={(e) => setForm({ ...form, food: e.target.value })}>
                  {freeFoods.map((f) => <option key={f.name} value={f.name}>{f.label ?? f.name}</option>)}
                </select>
              </label>
              <label>
                Value ({carbon ? "kg CO2e/kg" : "L/kg"})
                <input type="number" required min={0} step="any" value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </label>
              <label className="impacts-source">
                Source
                <input value={form.source} maxLength={300} onChange={(e) => setForm({ ...form, source: e.target.value })} />
              </label>
              <button type="submit" className="eh-button">Add</button>
            </div>
          )}
        </form>
      )}

      <section className="impacts-card">
        <div className="eh-table-wrap">
          <table className="eh-table">
            <thead>
              <tr>
                <th>#</th><th>Food</th><th>Value</th>{carbon && <th>Level</th>}<th>Source</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {(impacts ?? []).map((item, index) => {
                const badge = co2Badge(item.value);
                return (
                  <tr key={item.id}>
                    <td>{index + 1}</td>
                    <td><Link to={`/foods/${encodeURIComponent(item.food)}`}>{item.food_label ?? item.food}</Link></td>
                    <td>
                      {editing?.id === item.id ? (
                        <input className="impacts-edit" type="number" min={0} step="any" autoFocus aria-label="New value"
                          value={editing.value} onChange={(e) => setEditing({ id: item.id, value: e.target.value })} />
                      ) : (
                        <strong>{item.value}</strong>
                      )} {item.unit}
                    </td>
                    {carbon && <td><span className={badge.className} title={badge.title}>{badge.label}</span></td>}
                    <td className="eh-muted">{item.source ?? "—"}</td>
                    {isAdmin && (
                      <td className="impacts-actions">
                        {editing?.id === item.id ? (
                          <>
                            <button type="button" className="eh-button" onClick={() => void save(item.id, editing.value)}>Save</button>
                            <button type="button" className="eh-button secondary" onClick={() => setEditing(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="eh-button secondary"
                              onClick={() => setEditing({ id: item.id, value: String(item.value ?? "") })}>
                              <Pencil size={14} /> Edit
                            </button>
                            <button type="button" className="eh-button danger" onClick={() => void remove(item)}>
                              <Trash2 size={14} /> Delete
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {impacts === null && <p className="eh-muted">Loading…</p>}
        {impacts?.length === 0 && <p className="eh-muted">No {kind} footprints yet.</p>}
      </section>
    </main>
  );
}
