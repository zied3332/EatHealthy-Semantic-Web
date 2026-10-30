
import {
  BrowserRouter,
  Navigate,
  Routes,
  Route,
  useParams,
} from "react-router-dom";

import type { ReactNode } from "react";

import AppLayout from "./components/layout/AppLayout";
import ClientLayout from "./components/layout/ClientLayout";
import PublicLayout from "./components/layout/PublicLayout";

import { ProfileProvider } from "./context/ProfileContext";
import { AuthProvider, useAuth } from "./context/AuthContext";

// ============================================================
// PAGES
// ============================================================

import Home from "./pages/Home/Home";

import Profile from "./pages/Profile/Profile";
import ProfileEdit from "./pages/ProfileEdit/ProfileEdit";

import Foods from "./pages/Foods/Foods";
import FoodDetails from "./pages/FoodDetails/FoodDetails";

import Diets from "./pages/Diets/Diets";
import HealthPreferences from "./pages/HealthPreferences/HealthPreferences";

// NEW: Natural Language to SPARQL
import SemanticSearch from "./pages/SemanticSearch/SemanticSearch";

import Recommendations from "./pages/Recommendations/Recommendations";

import Login from "./pages/Auth/Login";
import Register from "./pages/Auth/Register";

import AdminUsers from "./pages/AdminUsers/AdminUsers";

import Impacts from "./pages/Impacts/Impacts";
import Nutrients from "./pages/Nutrients/Nutrients";
import Meals from "./pages/Meals/Meals";

// ============================================================
// PLACEHOLDER
// ============================================================

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div>
      <h1>{title}</h1>
      <p>This EatHealthy module is coming soon.</p>
    </div>
  );
}

// ============================================================
// PROTECTED LAYOUT
// ============================================================

function ProtectedLayout() {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return user.role === "admin" ? (
    <AppLayout />
  ) : (
    <ClientLayout />
  );
}

// ============================================================
// CLIENT-ONLY ROUTE
// ============================================================

function ClientOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === "admin") {
    return <Navigate to="/admin/users" replace />;
  }

  return <>{children}</>;
}

// ============================================================
// NUTRIENT REDIRECT
// ============================================================

function NutrientFoodRedirect() {
  const { foodName } = useParams();

  return (
    <Navigate
      to={`/foods/${encodeURIComponent(foodName || "")}`}
      replace
    />
  );
}

// ============================================================
// HOME
// ============================================================

function HomeRoute() {
  const { user } = useAuth();

  if (!user) {
    return (
      <PublicLayout>
        <Home />
      </PublicLayout>
    );
  }

  return user.role === "admin" ? (
    <AppLayout>
      <Home />
    </AppLayout>
  ) : (
    <ClientLayout>
      <Home />
    </ClientLayout>
  );
}

// ============================================================
// APPLICATION ROUTES
// ============================================================

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>

          <Route path="/" element={<HomeRoute />} />
        </Routes>

        <ProfileProvider>
          <Routes>
            <Route element={<ProtectedLayout />}>
              <Route path="/nutrients" element={<Nutrients />} />
              <Route path="/meals" element={<Meals />} />

              <Route
                path="/foods/:foodName/nutrients"
                element={<NutrientFoodRedirect />}
              />

              <Route path="/profile" element={<Profile />} />

              <Route
                path="/profile/edit"
                element={<ProfileEdit />}
              />

              <Route path="/foods" element={<Foods />} />

              <Route
                path="/foods/:foodName"
                element={<FoodDetails />}
              />

              <Route path="/impacts" element={<Impacts />} />

              <Route path="/diets" element={<Diets />} />

              <Route
                path="/health-preferences"
                element={
                  <ClientOnly>
                    <HealthPreferences />
                  </ClientOnly>
                }
              />

              {/* NLP: NATURAL LANGUAGE TO SPARQL */}
              <Route
                path="/semantic-search"
                element={
                  <ClientOnly>
                    <SemanticSearch />
                  </ClientOnly>
                }
              />

              <Route
                path="/recommendations"
                element={<Recommendations />}
              />

              <Route
                path="/assistant"
                element={
                  <PlaceholderPage title="AI Assistant" />
                }
              />

              <Route
                path="/admin/users"
                element={<AdminUsers />}
              />
            </Route>
          </Routes>
        </ProfileProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
