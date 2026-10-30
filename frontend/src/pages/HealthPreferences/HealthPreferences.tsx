
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import {
  HeartPulse,
  Target,
  Leaf,
  Save,
  Trash2,
  RefreshCw,
} from "lucide-react";

import api from "../../services/api";
import "./HealthPreferences.css";

interface Preferences {
  person: string;
  goal: string | null;
  diet: string | null;
}

const GOALS = [
  { value: "", label: "No health objective" },
  { value: "ObjectifPriseMasse1", label: "Muscle gain" },
  { value: "ObjectifPertePoids1", label: "Weight loss" },
  { value: "ObjectifMaintienPoids1", label: "Weight maintenance" },
];

const DIETS = [
  { value: "", label: "No dietary regime" },
  { value: "RegimeOmnivore1", label: "Omnivore" },
  { value: "RegimeVegetarien1", label: "Vegetarian" },
  { value: "RegimeVegan1", label: "Vegan" },
  { value: "RestrictionSansGluten1", label: "Gluten-free" },
];

const ENDPOINT = "/api/health-preferences/me";

export default function HealthPreferences() {
  const [goal, setGoal] = useState("");
  const [diet, setDiet] = useState("");
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadPreferences = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get<Preferences>(ENDPOINT);
      const preferences = response.data;

      setGoal(preferences.goal ?? "");
      setDiet(preferences.diet ?? "");
      setConfigured(
        Boolean(preferences.goal || preferences.diet)
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!goal && !diet) {
      setError("Please select at least one preference.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        goal: goal || null,
        diet: diet || null,
      };

      const response = configured
        ? await api.put<Preferences>(ENDPOINT, payload)
        : await api.post<Preferences>(ENDPOINT, payload);

      setGoal(response.data.goal ?? "");
      setDiet(response.data.diet ?? "");
      setConfigured(
        Boolean(response.data.goal || response.data.diet)
      );

      setSuccess(
        configured
          ? "Your preferences have been updated."
          : "Your preferences have been created."
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        "Are you sure you want to delete your health preferences?"
      )
    ) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await api.delete(ENDPOINT);

      setGoal("");
      setDiet("");
      setConfigured(false);
      setSuccess("Your preferences have been deleted.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const goalLabel =
    GOALS.find((item) => item.value === goal)?.label ??
    "Not selected";

  const dietLabel =
    DIETS.find((item) => item.value === diet)?.label ??
    "Not selected";

  return (
    <main className="health-preferences-page">
      <header className="health-preferences-heading">
        <span className="health-preferences-eyebrow">
          PERSONAL HEALTH
        </span>

        <h1>My Health Preferences</h1>

        <p>
          Set your health objective and dietary regime to
          personalize your nutrition experience.
        </p>
      </header>

      <section className="health-preferences-card">
        <div className="health-preferences-card-header">
          <div className="health-preferences-card-title">
            <div className="health-preferences-icon">
              <HeartPulse size={23} />
            </div>

            <div>
              <h2>Your preferences</h2>
              <p>Manage your personal nutrition settings.</p>
            </div>
          </div>

          <span
            className={
              configured
                ? "health-preferences-status configured"
                : "health-preferences-status"
            }
          >
            {configured ? "Configured" : "Not configured"}
          </span>
        </div>

        {error && (
          <div className="health-preferences-alert error" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div
            className="health-preferences-alert success"
            role="status"
          >
            {success}
          </div>
        )}

        {loading ? (
          <p className="health-preferences-loading">
            Loading your health preferences...
          </p>
        ) : (
          <form onSubmit={handleSave}>
            <div className="health-preferences-fields">
              <label>
                <span>Health objective</span>

                <select
                  value={goal}
                  onChange={(event) =>
                    setGoal(event.target.value)
                  }
                  disabled={saving}
                >
                  {GOALS.map((item) => (
                    <option
                      key={item.value}
                      value={item.value}
                    >
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Dietary regime</span>

                <select
                  value={diet}
                  onChange={(event) =>
                    setDiet(event.target.value)
                  }
                  disabled={saving}
                >
                  {DIETS.map((item) => (
                    <option
                      key={item.value}
                      value={item.value}
                    >
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="health-preferences-summary">
              <div className="health-preferences-summary-item">
                <Target size={24} />
                <span>Health objective</span>
                <strong>{goalLabel}</strong>
              </div>

              <div className="health-preferences-summary-item">
                <Leaf size={24} />
                <span>Dietary regime</span>
                <strong>{dietLabel}</strong>
              </div>
            </div>

            <div className="health-preferences-actions">
              <button
                type="submit"
                className="health-preferences-save"
                disabled={saving || (!goal && !diet)}
              >
                <Save size={17} />
                {saving
                  ? "Saving..."
                  : configured
                    ? "Update preferences"
                    : "Create preferences"}
              </button>

              <button
                type="button"
                className="health-preferences-delete"
                onClick={handleDelete}
                disabled={saving || !configured}
              >
                <Trash2 size={17} />
                Delete preferences
              </button>

              <button
                type="button"
                className="health-preferences-refresh"
                onClick={() => {
                  setSuccess("");
                  void loadPreferences();
                }}
                disabled={saving}
              >
                <RefreshCw size={17} />
                Refresh
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;

    if (typeof detail === "string") {
      return detail;
    }

    if (error.response?.status === 401) {
      return "Your session has expired. Please sign in again.";
    }

    if (error.response?.status === 403) {
      return "You do not have permission to perform this action.";
    }
  }

  return "Unable to load or save health preferences. Please try again.";
}
