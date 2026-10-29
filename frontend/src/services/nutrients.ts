import api from "./api";

export const NUTRIENT_TYPES: Record<string, string> = {
  Proteine: "Protéine", Glucide: "Glucide", Lipide: "Lipide", Vitamine: "Vitamine", Mineral: "Minéral", Fibre: "Fibres",
};
export interface Nutrient {
  id: string;
  name: string;
  type: string;
  composition?: boolean;
  property?: string;
  sources?: Record<string, QuantitySource>;
  foods: { id: string; name: string; values?: (number | string)[] }[];
}
export interface NutrientCategory { id: string; name: string }
export const getNutrientCategories = () => api.get<{ categories: NutrientCategory[] }>("/api/nutrients/categories").then(r => r.data.categories);
export const renameNutrientCategory = (id: string, name: string) => api.put(`/api/nutrients/categories/${encodeURIComponent(id)}`, { name });
export const createNutrientCategory = (name: string) => api.post<NutrientCategory>("/api/nutrients/categories", { name }).then(r => r.data);
export const deleteNutrientCategory = (id: string) => api.delete(`/api/nutrients/categories/${encodeURIComponent(id)}`);
export interface QuantitySource { unit: "g" | "mg" | "µg"; basis: "100 g"; preparation: string; source: string }
export interface NutrientBody { name: string; type: string; foods: string[]; amounts?: Record<string, number[]>; sources?: Record<string, QuantitySource> }
export interface NutrientSuggestion extends NutrientBody { existing_id: string | null; explanation: string; quantity_source: "Fuseki" | "web" | "unknown"; model: string }
export const suggestNutrient = (name: string, category: string) => api.post<NutrientSuggestion>("/api/nutrients/suggest", { name, category }, { timeout: 215000 }).then(r => r.data);
export interface NutritionValue { property: string; name: string; values: (number | string)[] }
export const getFoodNutrition = (food: string) => api.get<{ nutrition: NutritionValue[]; associations: Nutrient[]; categories: NutrientCategory[] }>(`/api/nutrients/food/${encodeURIComponent(food)}/nutrition`, { timeout: 30000 }).then(r => r.data);
export const getNutrients = (food?: string) => api.get<{ nutrients: Nutrient[] }>("/api/nutrients", { params: { food } }).then(r => r.data.nutrients);
export const saveNutrient = (body: NutrientBody, id?: string) => id
  ? api.put(`/api/nutrients/${encodeURIComponent(id)}`, body)
  : api.post("/api/nutrients", body);
export const deleteNutrient = (id: string) => api.delete(`/api/nutrients/${encodeURIComponent(id)}`);
