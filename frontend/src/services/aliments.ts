// Food module ("Gestion des aliments"): types, API calls and small helpers.
import axios from "axios";

import api from "./api";

export const CATEGORY_LABELS: Record<string, string> = {
  Fruit: "Fruit", Legume: "Vegetable", Cereale: "Cereal", Viande: "Meat", Poisson: "Fish", ProduitLaitier: "Dairy",
};
export const DEFAULT_SOURCE = "Our World in Data, Poore & Nemecek (2018)";
export const ADMIN_ONLY = "Only admins can add, edit or delete. Log in as admin.";

export type ImpactType = "EmpreinteCarbone" | "EmpreinteEau";

export interface FoodSummary {
  name: string;
  label: string | null;
  category: string;
  calories: number | null;
  price: number | null;
  organic: boolean | null;
  local: boolean | null;
  co2: number | null;
  water: number | null;
  sustainable: boolean;
}

export interface Impact {
  id: string;
  food: string;
  food_label: string | null;
  value: number | null;
  unit: string;
  source: string | null;
}

export interface AskResponse {
  mode: "groq" | "example" | "none";
  sparql: string | null;
  explanation: string | null;
  kind: "select" | "ask" | null;
  columns: string[];
  rows: Record<string, string | number | boolean | null>[];
  answer: string;
}

/** Same thresholds as the OWL classes AlimentFaibleCarbone and AlimentFortCarbone. */
export function co2Level(value: number | null): "low" | "medium" | "high" | null {
  if (value === null) return null;
  return value <= 2 ? "low" : value >= 10 ? "high" : "medium";
}

/** CSS class, text and tooltip of the CO2 badge. */
export function co2Badge(value: number | null) {
  const level = co2Level(value);
  if (level === "low") return { className: "eh-badge low", label: "Low carbon", title: "AlimentFaibleCarbone (≤ 2 kg CO2e/kg)" };
  if (level === "high") return { className: "eh-badge high", label: "High carbon", title: "AlimentFortCarbone (≥ 10 kg CO2e/kg)" };
  if (level === "medium") return { className: "eh-badge medium", label: "Medium carbon", title: "Between 2 and 10 kg CO2e/kg" };
  return { className: "eh-badge", label: "No CO2 data", title: "No carbon footprint yet" };
}

/** The backend's error message ("detail"), or a fallback. */
export function errorMessage(error: unknown, fallback: string): string {
  const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => `${d.loc?.at(-1)}: ${d.msg}`).join(" · ");
  return fallback;
}

// ---------------------------------------------------------------- API calls
export const getFoods = () =>
  api.get<{ foods: FoodSummary[] }>("/api/foods").then((r) => r.data.foods);

/** Create (no id) or update (id) a food; returns its id. */
export async function saveFood(body: Record<string, unknown>, id?: string): Promise<string> {
  if (id) {
    await api.put(`/api/foods/${encodeURIComponent(id)}`, body);
    return id;
  }
  return (await api.post<{ id: string }>("/api/foods", body)).data.id;
}

export const deleteFood = (id: string) => api.delete(`/api/foods/${encodeURIComponent(id)}`);

export const getImpacts = (type: ImpactType) =>
  api.get<{ impacts: Impact[] }>("/api/impacts", { params: { type } }).then((r) => r.data.impacts);

export const createImpact = (body: { food: string; type: ImpactType; value: number; source: string }) =>
  api.post("/api/impacts", body);

export const updateImpact = (id: string, value: number) =>
  api.put(`/api/impacts/${encodeURIComponent(id)}`, { value });

export const deleteImpact = (id: string) => api.delete(`/api/impacts/${encodeURIComponent(id)}`);

export const getExamples = () =>
  api.get<{ questions: string[] }>("/api/foods/ask/examples").then((r) => r.data.questions);

/** Groq + one retry can take longer than the default 10 s timeout. */
export const askFoods = (question: string) =>
  api.post<AskResponse>("/api/foods/ask", { question }, { timeout: 30000 }).then((r) => r.data);
