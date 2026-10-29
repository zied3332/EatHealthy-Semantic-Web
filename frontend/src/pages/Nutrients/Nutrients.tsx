import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ShieldCheck, Wheat, Droplets, Sprout, Leaf, Sparkles, LoaderCircle, Plus, Pencil, Trash2, X, CheckCircle2, CircleAlert, ChevronDown, Check, Layers } from "lucide-react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { errorMessage, getFoods } from "../../services/aliments";
import type { FoodSummary } from "../../services/aliments";
import { deleteNutrient, getFoodNutrition, getNutrients, getNutrientCategories, NUTRIENT_TYPES, saveNutrient, suggestNutrient, renameNutrientCategory, deleteNutrientCategory, createNutrientCategory } from "../../services/nutrients";
import type { Nutrient, NutrientBody, NutritionValue, NutrientCategory } from "../../services/nutrients";
import "./Nutrients.css";

function nutrientStyle(name: string, type: string) {
  if (name === "Fibres") return { Icon: Sprout, tone: "fiber" };
  if (name === "Sucres") return { Icon: Leaf, tone: "sugar" };
  if (type === "Proteine") return { Icon: ShieldCheck, tone: "proteins" };
  if (type === "Glucide") return { Icon: Wheat, tone: "carbs" };
  if (type === "Lipide") return { Icon: Droplets, tone: "fats" };
  if (type === "Mineral") return { Icon: Droplets, tone: "fiber" };
  return { Icon: Sparkles, tone: "proteins" };
}

export default function Nutrients({ embeddedFood, onSaved }: { embeddedFood?: string; onSaved?: () => void }) {
  const location = useLocation();
  const aiRequest = useRef(0);
  const { foodName } = useParams();
  const [params] = useSearchParams();
  const food = embeddedFood || foodName || params.get("food") || "";
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const [items, setItems] = useState<Nutrient[]>([]);
  const [categories, setCategories] = useState<NutrientCategory[]>([]);
  const [nutrition, setNutrition] = useState<NutritionValue[]>([]);
  const [foods, setFoods] = useState<FoodSummary[]>([]);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Nutrient | null>(null);
  const [form, setForm] = useState<NutrientBody | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNote, setAiNote] = useState("");
  const [categoryEdit, setCategoryEdit] = useState<{ id: string; name: string } | null>(null);
  const [newCategory, setNewCategory] = useState<string | null>(null);

  useEffect(() => {
    if (embeddedFood || location.pathname !== "/nutrients" || location.search) return;
    aiRequest.current += 1;
    setForm(null); setEditing(null); setCategoryEdit(null); setNewCategory(null); setSearch(""); setType("");
    setAiLoading(false); setAiNote(""); setError(""); setNotice("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.key, location.pathname, location.search, embeddedFood]);

  useEffect(() => () => { aiRequest.current += 1; }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError("");
    Promise.all([food ? getFoodNutrition(food) : getNutrients().then(associations => ({ associations, nutrition: [] as NutritionValue[], categories: [] as NutrientCategory[] })), embeddedFood && !admin ? Promise.resolve([]) : getFoods(), food ? Promise.resolve([]) : getNutrientCategories()]).then(([data, allFoods, allCategories]) => {
      if (active) { setItems(data.associations); setNutrition(data.nutrition); setFoods(allFoods); setCategories(food ? data.categories : allCategories); }
    }).catch(e => { if (active) setLoadError(errorMessage(e, "Impossible de charger les nutriments. Vérifiez le backend et Fuseki.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [food, revision, embeddedFood, admin]);

  function openForm(item?: Nutrient, category?: string) {
    setNewCategory(null);
    setAiNote("");
    setEditing(item || null); setError(""); setNotice("");
    setForm(item ? { name: item.name, type: item.type, foods: item.foods.map(f => f.id), amounts: Object.fromEntries(item.foods.map(f => [f.id, (f.values || []).map(Number)])), sources: item.sources || {} }
      : { name: "", type: category || type || "Proteine", foods: food ? [food] : [], amounts: {} });
  }

  async function completeWithAI() {
    if (!form || aiLoading) return;
    const name = form.name.trim();
    const request = ++aiRequest.current;
    setAiLoading(true); setError(""); setAiNote("");
    try {
      const suggestion = await suggestNutrient(name, form.type);
      if (request !== aiRequest.current) return;
      if (suggestion.existing_id) {
        const existing = items.find(item => item.id === suggestion.existing_id);
        if (!existing) throw new Error("Actualisez le catalogue pour modifier ce nutriment existant.");
        setEditing(existing);
      } else setEditing(null);
      setForm({ name, type: suggestion.type, foods: suggestion.foods, amounts: suggestion.amounts, sources: suggestion.sources || {} });
      setAiNote(`${suggestion.existing_id ? "Nutriment existant retrouvé : vous modifiez sa fiche. " : ""}${suggestion.explanation} ${suggestion.quantity_source === "Fuseki" ? "Valeurs récupérées dans Fuseki." : suggestion.quantity_source === "web" ? "Valeurs proposées : vérifiez les quantités et les préparations ci-dessous." : "Aucune valeur disponible pour ces aliments."} Vérifiez avant d’enregistrer.`);
    } catch (e) { if (request === aiRequest.current) setError(errorMessage(e, "La recherche n’a pas abouti. Réessayez ou continuez manuellement.")); }
    finally { if (request === aiRequest.current) setAiLoading(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await saveNutrient({ ...form, name: form.name.trim(), amounts: Object.fromEntries(Object.entries(form.amounts || {}).filter(([id]) => form.foods.includes(id))), sources: Object.fromEntries(Object.entries(form.sources || {}).filter(([id]) => form.foods.includes(id))) }, editing?.id);
      setForm(null); setNotice(editing ? "Nutriment modifié." : "Nutriment créé."); setRevision(r => r + 1);
      onSaved?.();
    } catch (e) { setError(errorMessage(e, "Impossible d’enregistrer le nutriment.")); }
    finally { setBusy(false); }
  }

  async function remove(item: Nutrient) {
    if (!window.confirm(`Supprimer « ${item.name} », ses associations et ses valeurs sur tous les aliments ? Les aliments seront conservés.`)) return;
    setBusy(true); setError(""); setNotice("");
    try { await deleteNutrient(item.id); setNotice("Nutriment supprimé."); setRevision(r => r + 1); onSaved?.(); }
    catch (e) { setError(errorMessage(e, "Suppression impossible.")); }
    finally { setBusy(false); }
  }

  async function saveCategory(event: FormEvent) {
    event.preventDefault();
    if (!categoryEdit) return;
    setBusy(true); setError(""); setNotice("");
    try { await renameNutrientCategory(categoryEdit.id, categoryEdit.name.trim()); setCategoryEdit(null); setNotice("Catégorie modifiée."); setRevision(r => r + 1); }
    catch (e) { setError(errorMessage(e, "Impossible de modifier la catégorie.")); }
    finally { setBusy(false); }
  }

  async function addCategory(event: FormEvent) {
    event.preventDefault();
    if (newCategory === null) return;
    setBusy(true); setError(""); setNotice("");
    try { const category = await createNutrientCategory(newCategory.trim()); setNewCategory(null); setType(category.id); setNotice("Catégorie ajoutée dans la base."); setRevision(r => r + 1); }
    catch (e) { setError(errorMessage(e, "Impossible d’ajouter la catégorie.")); }
    finally { setBusy(false); }
  }

  async function removeCategory(category: NutrientCategory) {
    if (!window.confirm(`Supprimer la catégorie « ${category.name} » de l’ontologie ? Cette action exige une catégorie vide.`)) return;
    setBusy(true); setError(""); setNotice("");
    try { await deleteNutrientCategory(category.id); setCategoryEdit(null); if (type === category.id) setType(""); setNotice("Catégorie supprimée."); setRevision(r => r + 1); }
    catch (e) { setError(errorMessage(e, "Impossible de supprimer la catégorie.")); }
    finally { setBusy(false); }
  }

  const visible = items.filter(item => (!type || item.type === type)
    && `${item.name} ${item.id}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const foodLabel = foods.find(f => f.name === food)?.label || food;
  const allCategories = [...categories];
  for (const item of items) {
    if (!allCategories.some(c => c.id === item.type)) allCategories.push({ id: item.type, name: NUTRIENT_TYPES[item.type] || item.type });
  }
  const availableCategories = embeddedFood ? allCategories.filter(c => items.some(item => item.type === c.id)) : allCategories;
  const shownCategories = availableCategories.filter(c => !type || c.id === type);

  return <section className={`nutrients-page${embeddedFood ? " nutrients-embedded" : ""}`}>
    <header className={`nutrients-header${!embeddedFood ? " nutrient-hero" : ""}`}>
      {!embeddedFood && <div className="nutrient-hero-art" aria-hidden="true"><span className="hero-orbit orbit-one" /><span className="hero-orbit orbit-two" /><span className="hero-art-center"><Sprout size={44} strokeWidth={1.4} /></span><span className="hero-art-node node-one"><Droplets size={20} /></span><span className="hero-art-node node-two"><Wheat size={20} /></span><span className="hero-art-node node-three"><Sparkles size={20} /></span></div>}
      <div className="nutrient-hero-copy"><span className="nutrients-eyebrow">{embeddedFood ? "EATHEALTHY · NUTRITION" : "LE CATALOGUE NUTRITIONNEL"}</span>
        {embeddedFood ? <h2>Les nutriments de {foodLabel}</h2> : <h1>{foodName ? `Nutrition et nutriments · ${foodLabel}` : "Gestion des nutriments"}</h1>}
        <p>{embeddedFood ? "Retrouvez chaque nutriment, sa famille et la quantité enregistrée pour cet aliment." : "Explorez les familles de nutriments et découvrez la composition de vos aliments."}</p>
        {!embeddedFood && <div className="nutrient-hero-stats"><span><strong>{loading ? "—" : items.length}</strong> nutriments</span><span><strong>{loading ? "—" : allCategories.length}</strong> catégories</span><span><strong>{loading ? "—" : new Set(items.flatMap(item => item.foods.map(f => f.id))).size}</strong> aliments associés</span></div>}
      </div>
      {admin && !form && <div className="nutrient-header-actions"><button className="nutrients-primary nutrient-hero-add" onClick={() => openForm()}><Plus size={17} /> Ajouter un nutriment</button>
        {!embeddedFood && <button className="nutrient-hero-add" onClick={() => { setNewCategory(""); setError(""); setNotice(""); }}><Plus size={17} /> Ajouter une catégorie</button>}</div>}
    </header>
    {foodName && !embeddedFood && <Link to={`/foods/${encodeURIComponent(foodName)}`}>← Retour à la fiche aliment</Link>}
    <div className="nutrient-notifications">
      {notice && !error && <div className="nutrient-toast success" role="status"><CheckCircle2 size={20} /><div><strong>Opération réussie</strong><p>{notice}</p></div><button aria-label="Fermer la notification" onClick={() => setNotice("")}><X size={17} /></button></div>}
      {(error || loadError) && <div className="nutrient-toast warning" role="alert"><CircleAlert size={20} /><div><strong>{loadError ? "Chargement impossible" : "Action non effectuée"}</strong><p>{error || loadError}</p>{loadError && <button disabled={loading} onClick={() => setRevision(r => r + 1)}>Réessayer</button>}</div><button aria-label="Fermer le message" onClick={() => { setError(""); setLoadError(""); }}><X size={17} /></button></div>}
    </div>
    {admin && newCategory !== null && <form className="nutrients-form" onSubmit={addCategory}>
      <h2>Ajouter une catégorie</h2><label>Nom de la catégorie<input autoFocus required minLength={2} maxLength={80} disabled={busy} value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="Ex. : Acides aminés" /></label>
      <p className="nutrients-muted">La catégorie sera créée dans l’ontologie sous Nutriment. Elle sera visible par les clients et disponible lors de l’ajout d’un nutriment.</p>
      <div className="nutrients-actions"><button className="nutrients-primary" disabled={busy || newCategory.trim().length < 2}>Créer la catégorie</button><button type="button" disabled={busy} onClick={() => setNewCategory(null)}>Annuler</button></div>
    </form>}
    {food && !embeddedFood && !loading && !loadError && <section className="nutrients-summary" aria-label="Valeurs nutritionnelles">
      <h2>Valeurs nutritionnelles de {foodLabel}</h2>
      <p>Les mêmes valeurs que sur la fiche aliment. Les unités et la portion ne sont pas renseignées.</p>
      <div className="nutrients-grid">{nutrition.map(n => <article className="nutrient-card" key={n.property}>
        <h3>{n.name}</h3><strong className="nutrient-number">{n.values.length ? n.values.map(v => typeof v === "number" ? v.toLocaleString("fr-FR") : v).join(" / ") : "Non renseigné"}</strong>
      </article>)}</div>
    </section>}
    {form && <form className="nutrients-form" onSubmit={submit} aria-label="Formulaire nutriment">
      <fieldset className="nutrients-ai-fields" disabled={busy || aiLoading}>
      <h2>{editing ? "Modifier le nutriment" : "Ajouter un nutriment"}</h2>
      <label>Nom<input autoFocus required minLength={2} maxLength={80} value={form.name} disabled={busy}
        onChange={e => { setForm({ ...form, name: e.target.value }); setAiNote(""); }} placeholder="Ex. : Fer, Vitamine C…" /></label>
      <fieldset className="nutrient-category-picker" disabled={busy || !!editing?.property && !editing.property.startsWith("teneur_")}>
        <legend>Catégorie du nutriment</legend>
        <div className="nutrient-category-options">{allCategories.map(({ id: key, name: label }) => {
          const { Icon, tone } = nutrientStyle(label, key);
          return <label className={`nutrient-category-option${form.type === key ? " checked" : ""}`} key={key}>
            <input type="radio" name="nutrient-category" value={key} checked={form.type === key} onChange={() => { setForm({ ...form, type: key }); setAiNote(""); }} />
            <span className={`nutrient-icon ${tone}`}><Icon size={19} /></span><span>{label}</span><span className="nutrient-category-radio" aria-hidden="true" />
          </label>;
        })}</div>
      </fieldset>
      <div className="nutrients-ai-box"><div className="nutrients-ai-description"><span className="nutrients-eyebrow">ASSISTANT NUTRITION</span><h3>Compléter les aliments et leurs valeurs</h3>
        <p>À partir du nom et de la catégorie. Vérifiez les valeurs avant d’enregistrer.</p></div>
        <button type="button" className="nutrients-primary" disabled={form.name.trim().length < 2 || !allCategories.some(c => c.id === form.type)} onClick={() => void completeWithAI()}>{aiLoading ? <LoaderCircle className="nutrient-spin" size={17} /> : <Sparkles size={17} />} {aiLoading ? "Préparation…" : "Compléter avec l’IA"}</button>
        {aiLoading && <div className="nutrients-ai-animation" role="status" aria-live="polite"><div className="nutrient-ai-orbit"><span /><span /><span /><Sparkles size={26} /></div><div><strong>Votre assistant prépare les nutriments<span className="nutrient-ai-dots"><i /><i /><i /></span></strong><p>Recherche des aliments et de leurs valeurs. Le formulaire se remplit automatiquement dès que la proposition est prête.</p></div></div>}</div>
      {aiNote && <p className="nutrients-info" role="status">{aiNote}</p>}
      <fieldset disabled={busy}><legend>Aliments associés ({form.foods.length})</legend>
        <p>Cochez pour associer un aliment ; décochez pour retirer uniquement le lien.</p>
        <div className="nutrients-checks">{foods.map(f => <label key={f.name}><input type="checkbox" checked={form.foods.includes(f.name)}
          onChange={e => setForm({ ...form, foods: e.target.checked ? [...form.foods, f.name] : form.foods.filter(id => id !== f.name) })} />{f.label || f.name}</label>)}</div>
      </fieldset>
      <fieldset disabled={busy}><legend>Valeurs par aliment</legend>
        <p>Ces valeurs sont enregistrées dans Fuseki. Retirer un aliment supprime sa valeur pour ce nutriment. Laissez vide si la quantité est inconnue.</p>
        <div className="nutrients-amounts">{form.foods.map(id => <label key={id}>{foods.find(f => f.name === id)?.label || id}
          {(form.amounts?.[id]?.length ? form.amounts[id] : [null]).map((amount, index) => <input key={index} type="number" min="0" step="any" value={amount ?? ""} aria-label={`Valeur ${index + 1} pour ${id}`}
            onChange={e => { const values = [...(form.amounts?.[id] || [])]; if (e.target.value === "") values.splice(index, 1); else values[index] = Number(e.target.value); const sources = { ...form.sources }; delete sources[id]; setForm({ ...form, amounts: { ...form.amounts, [id]: values }, sources }); }} />)}
          {form.sources?.[id] && <span className="nutrient-source">{form.sources[id].unit} pour {form.sources[id].basis} · {form.sources[id].preparation}</span>}
        </label>)}</div>
      </fieldset>
      <div className="nutrients-actions"><button className="nutrients-primary" disabled={busy || form.name.trim().length < 2 || !allCategories.some(c => c.id === form.type)}>{busy ? "Enregistrement…" : editing ? "Enregistrer les modifications" : "Confirmer et enregistrer"}</button>
        <button type="button" disabled={busy} onClick={() => setForm(null)}>Annuler</button></div>
      </fieldset>
    </form>}
    {!embeddedFood && <><h2>{food ? "Nutriments de cet aliment par catégorie" : "Catégories de nutriments"}</h2>
    <p className="nutrients-muted">Choisissez une catégorie pour découvrir les nutriments qu’elle contient.</p></>}
    {!embeddedFood && !loading && !loadError && <nav className="nutrient-category-nav" aria-label="Catégories de nutriments">
      <button className={!type ? "selected" : ""} aria-pressed={!type} onClick={() => setType("")}>Toutes les catégories <span>{items.length}</span></button>
      {availableCategories.map(category => {
        const { Icon, tone } = nutrientStyle(category.name, category.id);
        return <button key={category.id} className={type === category.id ? "selected" : ""} aria-pressed={type === category.id} onClick={() => setType(category.id)}>
          <span className={`nutrient-icon ${tone}`}><Icon size={18} /></span><span>{category.name}</span><span className="category-count">{items.filter(item => item.type === category.id).length}</span>
        </button>;
      })}
    </nav>}
    {!embeddedFood && <div className="nutrients-filters">
      <label>Rechercher<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom du nutriment…" /></label>
      <div className="nutrient-filter-category"><span id="nutrient-filter-category-label">Catégorie</span>
        <details className="nutrient-select" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false; }}>
          <summary aria-labelledby="nutrient-filter-category-label nutrient-filter-category-value"><span id="nutrient-filter-category-value">{availableCategories.find(c => c.id === type)?.name || "Toutes les catégories"}</span><ChevronDown size={17} /></summary>
          <div className="nutrient-select-options" role="group" aria-label="Choisir une catégorie">
            {[{ id: "", name: "Toutes les catégories" }, ...availableCategories].map(category => {
              const { Icon, tone } = category.id ? nutrientStyle(category.name, category.id) : { Icon: Layers, tone: "fiber" };
              return <button type="button" key={category.id} aria-pressed={type === category.id} className={type === category.id ? "selected" : ""} onClick={event => { setType(category.id); event.currentTarget.closest("details")?.removeAttribute("open"); }}><span className={`nutrient-icon ${tone}`}><Icon size={16} /></span><span>{category.name}</span>{type === category.id && <Check size={17} />}</button>;
            })}
          </div>
        </details>
      </div>
    </div>}
    {loading ? <div className="nutrient-loading-cards" role="status" aria-label="Chargement des valeurs depuis la base"><div /><div /><div /><div /><span>Chargement des nutriments depuis la base…</span></div> : !loadError && <>
      <p className="nutrients-muted">{visible.length} {food ? "nutriment(s) pour cet aliment" : "nutriment(s) dans le catalogue"}</p>
      {embeddedFood && visible.length > 0 && <div className="food-nutrient-cards">{visible.map(item => {
        const { Icon, tone } = nutrientStyle(item.name, item.type);
        const values = item.foods.find(f => f.id === embeddedFood)?.values || [];
        const measurement = item.sources?.[embeddedFood];
        const categoryName = allCategories.find(c => c.id === item.type)?.name || NUTRIENT_TYPES[item.type] || item.type;
        return <article className={`food-nutrient-tile ${tone}`} key={item.id}>
          <div className="food-nutrient-tile-top"><span className={`nutrient-icon ${tone}`}><Icon size={21} /></span><span className="food-nutrient-tile-category">{categoryName}</span></div>
          <h3>{item.name}</h3>
          <div className="food-nutrient-tile-value"><strong>{values.length ? values.map(v => typeof v === "number" ? v.toLocaleString("fr-FR") : v).join(" / ") : "—"}</strong>{measurement && <span>{measurement.unit}</span>}</div>
          <div className="food-nutrient-tile-footer"><span>{measurement ? `Pour ${measurement.basis}` : "Unité non renseignée"}</span>{measurement?.preparation && <small>{measurement.preparation}</small>}</div>
          {admin && <div className="nutrient-category-actions"><button className="category-icon-button" title="Modifier le nutriment" aria-label={`Modifier ${item.name}`} disabled={busy || !!form} onClick={() => openForm(item)}><Pencil size={16} /></button><button className="category-icon-button category-icon-delete" title="Supprimer le nutriment" aria-label={`Supprimer ${item.name}`} disabled={busy || !!form} onClick={() => void remove(item)}><Trash2 size={16} /></button></div>}
        </article>;
      })}</div>}
      {!embeddedFood && shownCategories.map(category => {
        const members = visible.filter(item => item.type === category.id);
        if (search && !members.length) return null;
        return <section className="nutrient-category-section" key={category.id} aria-label={category.name}>
          <div className="nutrient-category-heading"><div><span className="nutrients-eyebrow">CATÉGORIE</span><h2>{category.name} <span>{members.length} nutriment(s)</span></h2></div>
            {admin && <div className="nutrient-category-actions">
              <button className="category-icon-button" title="Modifier la catégorie" aria-label={`Modifier la catégorie ${category.name}`} disabled={busy || !!form} onClick={() => { setCategoryEdit({ ...category }); setError(""); }}><Pencil size={17} /></button>
              <button className="category-icon-button category-icon-delete" title="Supprimer la catégorie" aria-label={`Supprimer la catégorie ${category.name}`} disabled={busy || !!form} onClick={() => void removeCategory(category)}><Trash2 size={17} /></button>
            </div>}</div>
          {admin && categoryEdit?.id === category.id && <form className="nutrient-category-edit" onSubmit={saveCategory}>
            <label>Nom de la catégorie<input autoFocus required minLength={2} maxLength={80} value={categoryEdit.name} disabled={busy} onChange={e => setCategoryEdit({ ...categoryEdit, name: e.target.value })} /></label>
            <button className="nutrients-primary" disabled={busy || categoryEdit.name.trim().length < 2}>Enregistrer</button><button type="button" disabled={busy} onClick={() => setCategoryEdit(null)}>Annuler</button>
          </form>}
          {!members.length ? <p className="nutrients-empty">Aucun nutriment{food ? " pour cet aliment" : " enregistré"} dans cette catégorie.</p> : <div className="nutrients-grid nutrients-catalogue-grid">{members.map(item => {
          const { Icon, tone } = nutrientStyle(item.name, item.type);
          const selectedFoods = food ? item.foods.filter(f => f.id === food) : item.foods;
          const displayValue = (values?: (string | number)[]) => values?.length ? values.map(v => typeof v === "number" ? v.toLocaleString("fr-FR") : v).join(" / ") : "Non renseigné";
          const renderFood = (f: Nutrient["foods"][number]) => <div className="nutrient-value-row" key={f.id}><span><Link to={`/foods/${encodeURIComponent(f.id)}`}>{f.name}</Link>{item.sources?.[f.id] && <span className="nutrient-source">{item.sources[f.id].preparation}</span>}</span><strong>{displayValue(f.values)}{item.sources?.[f.id] && <small className="nutrient-source">{item.sources[f.id].unit} / {item.sources[f.id].basis}</small>}</strong></div>;
          return <article className={`nutrient-card nutrient-designed ${tone}`} key={item.id}>
          <div className="nutrient-card-heading"><span className={`nutrient-icon ${tone}`}><Icon size={20} /></span><h2>{item.name}</h2><span className="nutrient-type">{allCategories.find(c => c.id === item.type)?.name || NUTRIENT_TYPES[item.type] || item.type}</span></div>
          {food ? <div className="nutrient-selected-value"><strong>{displayValue(selectedFoods[0]?.values)}</strong><span>{foodLabel}</span>{item.sources?.[food] && <span className="nutrient-source">{item.sources[food].unit} pour {item.sources[food].basis} · {item.sources[food].preparation}</span>}</div>
            : <><p className="nutrient-food-count">{item.foods.length} aliment(s) associé(s)</p>
              <div className="nutrient-value-list">{selectedFoods.slice(0, 3).map(renderFood)}</div>
              {selectedFoods.length > 3 && <details className="nutrient-more"><summary>Voir les {selectedFoods.length - 3} autres aliments</summary><div className="nutrient-value-list">{selectedFoods.slice(3).map(renderFood)}</div></details>}
              {!selectedFoods.length && <p className="nutrients-muted">Aucun aliment associé</p>}</>}
          {admin && <div className="nutrients-actions"><button disabled={busy || !!form} onClick={() => openForm(item)}>Modifier / valeurs</button>
            <button className="nutrients-delete" disabled={busy || !!form} onClick={() => void remove(item)}>Supprimer</button></div>}
        </article>; })}</div>}</section>;
      })}
      {search && visible.length === 0 && <div className="nutrients-empty">Aucun nutriment ne correspond à cette recherche.</div>}
      {embeddedFood && !items.length && <p className="nutrients-empty">Aucun nutriment renseigné pour cet aliment dans la base.</p>}
    </>}
  </section>;
}
