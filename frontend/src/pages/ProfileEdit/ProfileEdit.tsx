import { useState } from "react";
import { Link, Navigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";
import "../Auth/Auth.css";

export default function ProfileEdit() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: "",
    age: "",
    weight: "",
    height: "",
    sex: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user || !user.person) return <Navigate to="/login" replace />;
  const personName = user.person;

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await api.put(`/api/users/${encodeURIComponent(personName)}`, {
        name: form.name || undefined,
        age: form.age ? Number(form.age) : undefined,
        weight: form.weight ? Number(form.weight) : undefined,
        height: form.height ? Number(form.height) : undefined,
        sex: form.sex || undefined,
      });
      setMessage("Profile updated successfully.");
    } catch {
      setError("Unable to update your profile.");
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>Edit my profile</h1>
        <p>Update the values stored in the semantic profile.</p>
        {message && <div>{message}</div>}
        {error && <div className="auth-error">{error}</div>}
        <form className="auth-form" onSubmit={submit}>
          <div className="auth-grid">
            {[
              ["name", "Full name"],
              ["age", "Age"],
              ["weight", "Weight (kg)"],
              ["height", "Height (cm)"],
              ["sex", "Sex"],
            ].map(([field, label]) => (
              <div className="auth-field" key={field}>
                <label htmlFor={field}>{label}</label>
                <input
                  id={field}
                  type={field === "age" || field === "weight" || field === "height" ? "number" : "text"}
                  value={form[field as keyof typeof form]}
                  onChange={(event) => update(field as keyof typeof form, event.target.value)}
                />
              </div>
            ))}
          </div>
          <button className="auth-submit">Save changes</button>
        </form>
        <Link className="auth-link" to="/profile">Back to profile</Link>
      </section>
    </main>
  );
}
