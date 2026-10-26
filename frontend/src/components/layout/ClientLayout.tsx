import { NavLink, Outlet } from "react-router-dom";
import { Leaf } from "lucide-react";
import type { ReactNode } from "react";

import { useAuth } from "../../context/AuthContext";
import { navigation } from "./AppLayout";
import "./ClientLayout.css";

export default function ClientLayout({
  children,
}: {
  children?: ReactNode;
}) {
  const { user, logout } = useAuth();

  return (
    <div className="client-layout">
      <header className="client-navbar">
        <NavLink className="client-brand" to="/">
          <Leaf size={27} />
          <span>EatHealthy</span>
        </NavLink>

        <nav className="client-navigation" aria-label="Client navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  `client-navigation-link ${isActive ? "active" : ""}`
                }
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="client-account">
          <span>{user?.username}</span>
          <button type="button" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="client-main">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
