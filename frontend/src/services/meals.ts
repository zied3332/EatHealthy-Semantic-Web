// Meal module ("Repas"): types and API calls.
import api from "./api";

export type MealType = "PetitDejeuner" | "Dejeuner" | "Diner" | "Collation";

export const MEAL_TYPES: Record<MealType, string> = {
  PetitDejeuner: "Breakfast", Dejeuner: "Lunch", Diner: "Dinner", Collation: "Snack",
};

/** Nutrient key -> label and unit (values per 100 g of food). */
export const NUTRIENTS = {
  calories: ["Calories", "kcal"], glucides: ["Carbs", "g"], proteines: ["Proteins", "g"], lipides: ["Fats", "g"],
  fibres: ["Fibres", "g"], sucre: ["Sugar", "g"], sodium: ["Sodium", "mg"],
} as const;

export type NutrientKey = keyof typeof NUTRIENTS;
export type Nutrients = Record<NutrientKey, number | null>;

export interface MealFood extends Nutrients {
  id: string;
  label: string;
}

export interface Meal {
  id: string;
  type: MealType;
  name: string;
  foods: { id: string; label: string }[];
  totals: Nutrients;
  mine: boolean;
}

export interface MealBody {
  name: string;
  type: MealType;
  foods: string[];
}

/** Sum of the nutrients of the chosen foods (unknown values count as 0, like the backend). */
export function sumNutrients(foods: MealFood[]): Nutrients {
  const total = {} as Nutrients;
  for (const key of Object.keys(NUTRIENTS) as NutrientKey[]) {
    total[key] = Math.round(foods.reduce((sum, f) => sum + (f[key] ?? 0), 0) * 10) / 10;
  }
  return total;
}

export const getMeals = () => api.get<{ meals: Meal[] }>("/api/meals").then((r) => r.data.meals);

export const getMealFoods = () => api.get<{ foods: MealFood[] }>("/api/meals/foods").then((r) => r.data.foods);

export const saveMeal = (body: MealBody, id?: string) =>
  id ? api.put(`/api/meals/${encodeURIComponent(id)}`, body) : api.post("/api/meals", body);

export const deleteMeal = (id: string) => api.delete(`/api/meals/${encodeURIComponent(id)}`);
