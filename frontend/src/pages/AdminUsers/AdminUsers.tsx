import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Fragment } from "react";
import { Eye, Pencil, Trash2 } from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";
import "./AdminUsers.css";

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

export default function AdminUsers() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadUsers() {
    api.get<{ users: AdminUser[] }>("/api/users")
      .then((response) => setUsers(response.data.users))
      .catch(() => setError("Unable to load users from Fuseki."));
  }

  useEffect(() => {
    if (user?.role === "admin") loadUsers();
  }, [user]);

  if (!user || user.role !== "admin") return <Navigate to="/" replace />;

  async function changeRole(person: string, role: "client" | "admin") {
    try {
      await api.patch(`/api/users/${encodeURIComponent(person)}/role`, null, {
        params: { role },
      });
      setUsers((current) =>
        current.map((item) =>
          item.person === person ? { ...item, role } : item
        )
      );
    } catch {
      setError("Unable to update this user's role.");
    }
  }

  async function remove(person: string) {
    if (!window.confirm(`Delete ${person}? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/users/${encodeURIComponent(person)}`);
      setUsers((current) => current.filter((item) => item.person !== person));
    } catch {
      setError("Unable to delete this user.");
    }
  }

  return (
    <main className="admin-users-page">
      <header className="admin-users-header">
        <div>
          <span className="admin-users-eyebrow">ADMINISTRATION</span>
          <h1>User management</h1>
          <p>Manage client profiles, roles, and access to EatHealthy.</p>
        </div>
        <strong>{users.length} accounts</strong>
      </header>

      {error && <div className="auth-error">{error}</div>}

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
                    <td>{item.weight ? `${item.weight} kg` : "—"}</td>
                    <td>{item.height ? `${item.height} cm` : "—"}</td>
                    <td>
                      <select
                        value={item.role}
                        onChange={(event) =>
                          void changeRole(
                            item.person,
                            event.target.value as "client" | "admin"
                          )
                        }
                        aria-label={`Role for ${item.username}`}
                      >
                        <option value="client">Client</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="admin-users-actions">
                      <button type="button" onClick={() => setEditing(editing === item.person ? null : item.person)} title="Edit user">
                        <Pencil size={16} /> Edit
                      </button>
                      <button type="button" onClick={() => setExpanded(expanded === item.person ? null : item.person)} title="View more">
                        <Eye size={16} /> View
                      </button>
                      {item.person !== user.person && (
                        <button className="danger" type="button" onClick={() => void remove(item.person)} title="Delete user">
                          <Trash2 size={16} /> Delete
                        </button>
                      )}
                    </td>
                  </tr>
                  {(expanded === item.person || editing === item.person) && (
                    <tr className="admin-users-detail" key={`${item.id}-detail`}>
                      <td colSpan={8}>
                        {expanded === item.person && (
                          <div>
                            <strong>Semantic profile</strong>
                            <span>RDF individual: {item.person}</span>
                            <span>Account identifier: {item.id}</span>
                          </div>
                        )}
                        {editing === item.person && (
                          <AdminEditForm
                            item={item}
                            onSaved={(updated) => {
                              setUsers((current) =>
                                current.map((value) =>
                                  value.person === item.person
                                    ? { ...value, ...updated }
                                    : value
                                )
                              );
                              setEditing(null);
                            }}
                            onError={() => setError("Unable to update this profile.")}
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
        {users.length === 0 && <p className="admin-users-empty">No accounts found.</p>}
      </section>
    </main>
  );
}

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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api.put(`/api/users/${encodeURIComponent(item.person)}`, {
        name: form.name || undefined,
        age: form.age ? Number(form.age) : undefined,
        weight: form.weight ? Number(form.weight) : undefined,
        height: form.height ? Number(form.height) : undefined,
        sex: form.sex || undefined,
      });
      onSaved(form);
    } catch {
      onError();
    }
  }

  return (
    <form className="admin-edit-form" onSubmit={submit}>
      {(["name", "age", "weight", "height"] as const).map((field) => (
        <label key={field}>
          {field}
          <input
            value={form[field]}
            type={field === "name" ? "text" : "number"}
            onChange={(event) => setForm({ ...form, [field]: event.target.value })}
          />
        </label>
      ))}
      <label>
        sex
        <select value={form.sex} onChange={(event) => setForm({ ...form, sex: event.target.value })}>
          <option value="">Not recorded</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      </label>
      <button className="admin-save-button" type="submit">Save changes</button>
    </form>
  );
}
