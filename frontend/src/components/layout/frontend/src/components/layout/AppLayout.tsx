
import { NavLink, Outlet } from "react-router-dom";
import {
  Leaf,
  House,
  UserRound,
  Apple,
  ShieldCheck,
  Sparkles,
  MessageCircle,
} from "lucide-react";

import "./AppLayout.css";

const navigation = [
  { label: "Home", path: "/", icon: House },
  { label: "My Profile", path: "/profile", icon: UserRound },
  { label: "Food Explorer", path: "/foods", icon: Apple },
  { label: "Dietary Preferences", path: "/diets", icon: ShieldCheck },
  { label: "Recommendations", path: "/recommendations", icon: Sparkles },
  { label: "AI Assistant", path: "/assistant", icon: MessageCircle },
];

export default function AppLayout() {
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
          <span>EatHealthy</span>
          <small>Semantic Nutrition Platform</small>
        </div>
      </aside>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
