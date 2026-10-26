import { Link, Outlet } from "react-router-dom";
import { Leaf } from "lucide-react";
import type { ReactNode } from "react";

import { useAuth } from "../../context/AuthContext";
import "./PublicLayout.css";

export default function PublicLayout({
  children,
}: {
  children?: ReactNode;
}) {
  const { user, logout } = useAuth();

  return (
    <div className="public-layout">
      <header className="public-navbar">
        <Link className="public-brand" to="/">
          <Leaf size={27} />
          <span>EatHealthy</span>
        </Link>

        <nav className="public-navigation" aria-label="Public navigation">
          <Link to="/">Home</Link>
          <a href="#features">Discover</a>
          {user ? (
            <>
              <Link className="public-dashboard-link" to="/profile">
                My Profile
              </Link>
              <button type="button" onClick={logout}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link className="public-signin" to="/login">
                Sign in
              </Link>
              <Link className="public-register" to="/register">
                Register
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="public-main">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
