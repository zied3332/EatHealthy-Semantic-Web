import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import "./Auth.css";

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: "", password: "", name: "", age: "30",
    weight: "70", height: "170", sex: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  function update(field: string, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await register({
        ...form,
        age: Number(form.age),
        weight: Number(form.weight),
        height: Number(form.height),
      });
      navigate("/");
    } catch {
      setError("Registration failed. Check the values and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>Create your account</h1>
        <p>Your profile will be stored in the EatHealthy knowledge graph.</p>
        {error && <div className="auth-error">{error}</div>}
        <form className="auth-form" onSubmit={submit}>
          <div className="auth-grid">
            {[
              ["username", "Username", "text"],
              ["password", "Password (8+ characters)", "password"],
              ["name", "Full name", "text"],
              ["age", "Age", "number"],
              ["weight", "Weight (kg)", "number"],
              ["height", "Height (cm)", "number"],
            ].map(([field, label, type]) => (
              <div className="auth-field" key={field}>
                <label htmlFor={field}>{label}</label>
                <input id={field} type={type} value={form[field as keyof typeof form]} onChange={(e) => update(field, e.target.value)} required />
              </div>
            ))}
            <div className="auth-field">
              <label htmlFor="sex">Sex</label>
              <select
                id="sex"
                value={form.sex}
                onChange={(event) => update("sex", event.target.value)}
                required
              >
                <option value="">Select sex</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
          </div>
          <button className="auth-submit" disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>
        <Link className="auth-link" to="/login">Already have an account? Sign in</Link>
      </section>
    </main>
  );
}
