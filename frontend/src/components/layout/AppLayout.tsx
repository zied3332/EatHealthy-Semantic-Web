
import { NavLink, Outlet } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  Leaf,
  House,
  UserRound,
  Apple,
  Sprout,
  ShieldCheck,
  Sparkles,
  MessageCircle,
} from "lucide-react";

import "./AppLayout.css";

export const navigation = [
  { label: "Home", path: "/", icon: House },
  { label: "My Profile", path: "/profile", icon: UserRound },
  { label: "Food Explorer", path: "/foods", icon: Apple },
  { label: "Nutriments", path: "/nutrients", icon: Sprout },
  { label: "Environmental Impact", path: "/impacts", icon: Leaf },
  { label: "Dietary Preferences", path: "/diets", icon: ShieldCheck },
  { label: "Recommendations", path: "/recommendations", icon: Sparkles },
  { label: "AI Assistant", path: "/assistant", icon: MessageCircle },
];

export default function AppLayout({
  children,
}: {
  children?: ReactNode;
}) {
  const { user, logout } = useAuth();
  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <Leaf size={28} />
          <span>EatHealthy</span>
        </div>

        <div className="sidebar-section-title">
          MAIN MENU
        </div>

        <nav className="sidebar-navigation">
          {user?.role === "admin" && (
            <NavLink className="sidebar-link" to="/admin/users">
              <UserRound size={19} />
              <span>Manage Users</span>
            </NavLink>
          )}
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  `sidebar-link ${isActive ? "active" : ""}`
                }
              >
                <Icon size={19} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <span>{user?.username}</span>
          <small>{user?.role}</small>
          <button type="button" onClick={logout}>Sign out</button>
        </div>
      </aside>

      <main className="app-main">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
