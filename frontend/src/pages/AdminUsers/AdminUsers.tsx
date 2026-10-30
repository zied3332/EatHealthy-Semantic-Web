
import { Fragment, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createPortal } from "react-dom";
import { Navigate } from "react-router-dom";
import {
  Eye,
  HeartPulse,
  Pencil,
  Trash2,
  X,
  RefreshCw,
} from "lucide-react";
import axios from "axios";

import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";
import "./AdminUsers.css";

// ============================================================
// TYPES
// ============================================================

interface AdminUser {
  id: string;
  username: string;
  role: "client" | "admin";
  person: string;
  name: string | null;
  age: string | null;
  weight: string | null;
  height: string | null;
  sex: string | null;
}

interface HealthPreferences {
  person: string;
  goal: string | null;
  diet: string | null;
}

// ============================================================
// HEALTH OPTIONS
// ============================================================

const GOALS = [
  { value: "ObjectifPriseMasse1", label: "Muscle gain" },
  { value: "ObjectifPertePoids1", label: "Weight loss" },
  {
    value: "ObjectifMaintienPoids1",
    label: "Weight maintenance",
  },
];

const DIETS = [
  { value: "RegimeOmnivore1", label: "Omnivore" },
  { value: "RegimeVegetarien1", label: "Vegetarian" },
  { value: "RegimeVegan1", label: "Vegan" },
  {
    value: "RestrictionSansGluten1",
    label: "Gluten-free",
  },
];

// ============================================================
// HELPERS
// ============================================================

function apiErrorMessage(
  error: unknown,
  fallback: string
): string {
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

  return fallback;
}

function accountLocalId(accountUri: string): string {
  return accountUri.split("#").pop() || accountUri;
}

// ============================================================
// ADMIN USERS PAGE
// ============================================================

export default function AdminUsers() {
  const { user } = useAuth();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [healthEditing, setHealthEditing] = useState<
    string | null
  >(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ----------------------------------------------------------
  // LOAD USERS
  // ----------------------------------------------------------

  function loadUsers() {
    setLoading(true);
    setError(null);

    api
      .get<{ users: AdminUser[] }>("/api/users")
      .then((response) => {
        setUsers(response.data.users);
      })
      .catch((err: unknown) => {
        setError(
          apiErrorMessage(
            err,
            "Unable to load users from Fuseki."
          )
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }

  useEffect(() => {
    if (user?.role === "admin") {
      loadUsers();
    }
  }, [user]);

  // ----------------------------------------------------------
  // TOGGLE PANELS
  // ----------------------------------------------------------

  function toggleEdit(person: string) {
    setEditing((current) =>
      current === person ? null : person
    );
    setExpanded(null);
    setHealthEditing(null);
  }

  function toggleView(person: string) {
    setExpanded((current) =>
      current === person ? null : person
    );
    setEditing(null);
    setHealthEditing(null);
  }

  function openHealth(accountId: string) {
    setHealthEditing(accountId);
    setEditing(null);
    setExpanded(null);
  }

  function closeHealth() {
    setHealthEditing(null);
  }

  // ----------------------------------------------------------
  // UPDATE ROLE
  // ----------------------------------------------------------

  async function changeRole(
    person: string,
    role: "client" | "admin"
  ) {
    try {
      setError(null);

      await api.patch(
        `/api/users/${encodeURIComponent(person)}/role`,
        null,
        { params: { role } }
      );

      setUsers((current) =>
        current.map((item) =>
          item.person === person
            ? { ...item, role }
            : item
        )
      );
    } catch (err: unknown) {
      setError(
        apiErrorMessage(
          err,
          "Unable to update this user's role."
        )
      );
    }
  }

  // ----------------------------------------------------------
  // DELETE USER
  // ----------------------------------------------------------

  async function remove(person: string) {
    if (
      !window.confirm(
        `Delete ${person}? This cannot be undone.`
      )
    ) {
      return;
    }

    try {
      setError(null);

      await api.delete(
        `/api/users/${encodeURIComponent(person)}`
      );

      setUsers((current) =>
        current.filter((item) => item.person !== person)
      );

      setExpanded(null);
      setEditing(null);
      setHealthEditing(null);
    } catch (err: unknown) {
      setError(
        apiErrorMessage(
          err,
          "Unable to delete this user."
        )
      );
    }
  }

  // ----------------------------------------------------------
  // AUTHORIZATION
  // ----------------------------------------------------------

  if (!user || user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  const selectedHealthUser =
    users.find((item) => item.id === healthEditing) ?? null;

  // ----------------------------------------------------------
  // RENDER
  // ----------------------------------------------------------

  return (
    <main className="admin-users-page">
      <header className="admin-users-header">
        <div>
          <span className="admin-users-eyebrow">
            ADMINISTRATION
          </span>

          <h1>User management</h1>

          <p>
            Manage client profiles, roles, health objectives,
            and dietary regimes.
          </p>
        </div>

        <strong>{users.length} accounts</strong>
      </header>

      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}

      <section className="admin-users-card">
        <div className="admin-users-table-wrap">
          <table className="admin-users-table">
            <thead>
              <tr>
                <th>Full name</th>
                <th>Username</th>
                <th>Sex</th>
                <th>Age</th>
                <th>Weight</th>
                <th>Height</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {users.map((item) => (
                <Fragment key={item.id}>
                  <tr>
                    <td>{item.name || "Not recorded"}</td>
                    <td>{item.username}</td>
                    <td>{item.sex || "Not recorded"}</td>
                    <td>{item.age || "—"}</td>

                    <td>
                      {item.weight
                        ? `${item.weight} kg`
                        : "—"}
                    </td>

                    <td>
                      {item.height
                        ? `${item.height} cm`
                        : "—"}
                    </td>

                    <td>
                      <select
                        value={item.role}
                        onChange={(event) =>
                          void changeRole(
                            item.person,
                            event.target.value as
                              | "client"
                              | "admin"
                          )
                        }
                        aria-label={`Role for ${item.username}`}
                      >
                        <option value="client">Client</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>

                    <td className="admin-users-actions">
                      <button
                        type="button"
                        onClick={() =>
                          toggleEdit(item.person)
                        }
                      >
                        <Pencil size={16} />
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          toggleView(item.person)
                        }
                      >
                        <Eye size={16} />
                        View
                      </button>

                      <button
                        type="button"
                        className="health-action"
                        onClick={() => openHealth(item.id)}
                        title="Manage health preferences"
                      >
                        <HeartPulse size={16} />
                        Health
                      </button>

                      {item.person !== user.person && (
                        <button
                          type="button"
                          className="danger"
                          onClick={() =>
                            void remove(item.person)
                          }
                        >
                          <Trash2 size={16} />
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>

                  {(expanded === item.person ||
                    editing === item.person) && (
                    <tr className="admin-users-detail">
                      <td colSpan={8}>
                        {expanded === item.person && (
                          <div className="admin-semantic-details">
                            <strong>Semantic profile</strong>

                            <span>
                              RDF individual: {item.person}
                            </span>

                            <span>
                              Account identifier: {item.id}
                            </span>
                          </div>
                        )}

                        {editing === item.person && (
                          <AdminEditForm
                            item={item}
                            onSaved={(updated) => {
                              setUsers((current) =>
                                current.map((value) =>
                                  value.person === item.person
                                    ? {
                                        ...value,
                                        ...updated,
                                      }
                                    : value
                                )
                              );

                              setEditing(null);
                            }}
                            onError={() =>
                              setError(
                                "Unable to update this profile."
                              )
                            }
                          />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {loading && (
          <p className="admin-users-empty">
            Loading accounts...
          </p>
        )}

        {!loading && users.length === 0 && (
          <p className="admin-users-empty">
            No accounts found.
          </p>
        )}
      </section>

      {selectedHealthUser && (
        <AdminHealthModal
          key={selectedHealthUser.id}
          item={selectedHealthUser}
          onClose={closeHealth}
        />
      )}
    </main>
  );
}

// ============================================================
// HEALTH PREFERENCES MODAL
// ============================================================

function AdminHealthModal({
  item,
  onClose,
}: {
  item: AdminUser;
  onClose: () => void;
}) {
  const [goal, setGoal] = useState("");
  const [diet, setDiet] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [hasPreferences, setHasPreferences] =
    useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(
    null
  );

  // IMPORTANT:
  // Backend path parameters require local RDF identifiers.
  // The account ID returned by /api/users may be a full URI.

  const localId = accountLocalId(item.id);

  const endpoint =
    `/api/health-preferences/users/` +
    encodeURIComponent(localId);

  const busy = loading || saving || deleting;

  // ----------------------------------------------------------
  // READ
  // ----------------------------------------------------------

  async function loadPreferences() {
    setLoading(true);
    setError(null);

    try {
      const response =
        await api.get<HealthPreferences>(endpoint);

      setGoal(response.data.goal || "");
      setDiet(response.data.diet || "");

      setHasPreferences(
        Boolean(response.data.goal || response.data.diet)
      );
    } catch (err: unknown) {
      setError(
        apiErrorMessage(
          err,
          "Unable to load health preferences."
        )
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPreferences();
  }, [endpoint]);

  // ----------------------------------------------------------
  // CREATE / UPDATE
  // ----------------------------------------------------------

  async function savePreferences(event: FormEvent) {
    event.preventDefault();

    if (!goal && !diet) {
      setError(
        "Select at least one health objective or dietary regime."
      );
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        goal: goal || null,
        diet: diet || null,
      };

      const wasConfigured = hasPreferences;

      const response = wasConfigured
        ? await api.put<HealthPreferences>(
            endpoint,
            payload
          )
        : await api.post<HealthPreferences>(
            endpoint,
            payload
          );

      setGoal(response.data.goal || "");
      setDiet(response.data.diet || "");

      setHasPreferences(
        Boolean(response.data.goal || response.data.diet)
      );

      setSuccess(
        wasConfigured
          ? "Health preferences updated successfully."
          : "Health preferences created successfully."
      );
    } catch (err: unknown) {
      setError(
        apiErrorMessage(
          err,
          "Unable to save health preferences."
        )
      );
    } finally {
      setSaving(false);
    }
  }

  // ----------------------------------------------------------
  // DELETE
  // ----------------------------------------------------------

  async function deletePreferences() {
    if (
      !window.confirm(
        `Remove all health preferences for ${item.username}?`
      )
    ) {
      return;
    }

    setDeleting(true);
    setError(null);
    setSuccess(null);

    try {
      await api.delete(endpoint);

      setGoal("");
      setDiet("");
      setHasPreferences(false);

      setSuccess(
        "Health preferences removed successfully."
      );
    } catch (err: unknown) {
      setError(
        apiErrorMessage(
          err,
          "Unable to delete health preferences."
        )
      );
    } finally {
      setDeleting(false);
    }
  }

  // ----------------------------------------------------------
  // RENDER MODAL
  // ----------------------------------------------------------

  return createPortal(
    <div
      className="admin-health-overlay"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
          !busy
        ) {
          onClose();
        }
      }}
    >
      <section
        className="admin-health-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Health preferences for ${item.username}`}
      >
        <button
          type="button"
          className="admin-health-close"
          onClick={onClose}
          disabled={busy}
          aria-label="Close popup"
        >
          <X size={20} />
        </button>

        <div className="admin-health-panel">
          <div className="admin-health-header">
            <div>
              <span className="admin-health-eyebrow">
                SEMANTIC HEALTH MANAGEMENT
              </span>

              <h3>
                Health preferences —{" "}
                {item.name || item.username}
              </h3>

              <p>
                Assign health objectives and dietary
                regimes to this user.
                Changes are stored in Fuseki.
              </p>
            </div>

            <span className="admin-health-status">
              {loading
                ? "Loading..."
                : hasPreferences
                  ? "Configured"
                  : "Not configured"}
            </span>
          </div>

          <div className="admin-health-user-info">
            <span>USER ACCOUNT</span>
            <strong>{item.username}</strong>
            <small>{item.role}</small>
          </div>

          {error && (
            <div
              className="admin-health-message error"
              role="alert"
            >
              {error}
            </div>
          )}

          {success && (
            <div
              className="admin-health-message success"
              role="status"
            >
              {success}
            </div>
          )}

          {loading ? (
            <p className="admin-health-loading">
              Loading preferences from Fuseki...
            </p>
          ) : (
            <form
              className="admin-health-form"
              onSubmit={(event) =>
                void savePreferences(event)
              }
            >
              <div className="admin-health-fields">
                <label>
                  <span>Health objective</span>

                  <select
                    value={goal}
                    disabled={busy}
                    onChange={(event) => {
                      setGoal(event.target.value);
                      setSuccess(null);
                    }}
                  >
                    <option value="">
                      No health objective
                    </option>

                    {GOALS.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Dietary regime</span>

                  <select
                    value={diet}
                    disabled={busy}
                    onChange={(event) => {
                      setDiet(event.target.value);
                      setSuccess(null);
                    }}
                  >
                    <option value="">
                      No dietary regime
                    </option>

                    {DIETS.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="admin-health-actions">
                <button
                  type="submit"
                  className="admin-save-button"
                  disabled={busy || (!goal && !diet)}
                >
                  {saving
                    ? "Saving..."
                    : hasPreferences
                      ? "Update preferences"
                      : "Create preferences"}
                </button>

                <button
                  type="button"
                  className="admin-health-delete"
                  disabled={busy || !hasPreferences}
                  onClick={() =>
                    void deletePreferences()
                  }
                >
                  <Trash2 size={16} />
                  {deleting
                    ? "Deleting..."
                    : "Delete preferences"}
                </button>

                <button
                  type="button"
                  className="admin-health-refresh"
                  disabled={busy}
                  onClick={() => {
                    setSuccess(null);
                    void loadPreferences();
                  }}
                >
                  <RefreshCw size={16} />
                  Refresh
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>,
    document.body
  );
}

// ============================================================
// USER PROFILE EDIT FORM
// ============================================================

function AdminEditForm({
  item,
  onSaved,
  onError,
}: {
  item: AdminUser;
  onSaved: (updated: Partial<AdminUser>) => void;
  onError: () => void;
}) {
  const [form, setForm] = useState({
    name: item.name || "",
    age: item.age || "",
    weight: item.weight || "",
    height: item.height || "",
    sex: item.sex || "",
  });

  async function submit(event: FormEvent) {
    event.preventDefault();

    try {
      await api.put(
        `/api/users/${encodeURIComponent(item.person)}`,
        {
          name: form.name || undefined,
          age: form.age
            ? Number(form.age)
            : undefined,
          weight: form.weight
            ? Number(form.weight)
            : undefined,
          height: form.height
            ? Number(form.height)
            : undefined,
          sex: form.sex || undefined,
        }
      );

      onSaved(form);
    } catch {
      onError();
    }
  }

  return (
    <form
      className="admin-edit-form"
      onSubmit={(event) => void submit(event)}
    >
      {(
        ["name", "age", "weight", "height"] as const
      ).map((field) => (
        <label key={field}>
          {field}

          <input
            value={form[field]}
            onChange={(event) =>
              setForm({
                ...form,
                [field]: event.target.value,
              })
            }
          />
        </label>
      ))}

      <label>
        Sex

        <select
          value={form.sex}
          onChange={(event) =>
            setForm({
              ...form,
              sex: event.target.value,
            })
          }
        >
          <option value="">Not recorded</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      </label>

      <button
        type="submit"
        className="admin-save-button"
      >
        Save changes
      </button>
    </form>
  );
}
