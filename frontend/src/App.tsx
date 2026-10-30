
import {
  BrowserRouter,
  Navigate,
  Routes,
  Route,
  useParams,
} from "react-router-dom";

import AppLayout from "./components/layout/AppLayout";
import ClientLayout from "./components/layout/ClientLayout";
import PublicLayout from "./components/layout/PublicLayout";

// ============================================================
// CONTEXT PROVIDERS
// ============================================================

import { ProfileProvider } from "./context/ProfileContext";
import { AuthProvider, useAuth } from "./context/AuthContext";

// ============================================================
// PAGES
// ============================================================

// Home
import Home from "./pages/Home/Home";

// Health Profile
import Profile from "./pages/Profile/Profile";
import ProfileEdit from "./pages/ProfileEdit/ProfileEdit";

// Food Explorer
import Foods from "./pages/Foods/Foods";

// Food Details
import FoodDetails from "./pages/FoodDetails/FoodDetails";

// Existing dietary preferences
import Diets from "./pages/Diets/Diets";

// NEW: Health objectives and dietary regimes CRUD
import HealthPreferences from "./pages/HealthPreferences/HealthPreferences";

// Personalized Recommendations
import Recommendations from "./pages/Recommendations/Recommendations";

// Authentication
import Login from "./pages/Auth/Login";
import Register from "./pages/Auth/Register";

// Administration
import AdminUsers from "./pages/AdminUsers/AdminUsers";

// Other modules
import Impacts from "./pages/Impacts/Impacts";
import Nutrients from "./pages/Nutrients/Nutrients";
import Meals from "./pages/Meals/Meals";

// ============================================================
// TEMPORARY PLACEHOLDER
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
// CLIENT-ONLY ROUTE GUARD
// ============================================================

function ClientOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== "client") {
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
// HOME ROUTE
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
// APPLICATION
// ============================================================

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        {/* PUBLIC ROUTES */}
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>

          <Route path="/" element={<HomeRoute />} />
        </Routes>

        {/* AUTHENTICATED ROUTES */}
        <ProfileProvider>
          <Routes>
            <Route element={<ProtectedLayout />}>
              {/* NUTRIENTS */}
              <Route path="/nutrients" element={<Nutrients />} />

              {/* MEALS */}
              <Route path="/meals" element={<Meals />} />

              <Route
                path="/foods/:foodName/nutrients"
                element={<NutrientFoodRedirect />}
              />

              {/* HEALTH PROFILE */}
              <Route path="/profile" element={<Profile />} />

              <Route
                path="/profile/edit"
                element={<ProfileEdit />}
              />

              {/* FOOD EXPLORER */}
              <Route path="/foods" element={<Foods />} />

              {/* FOOD DETAILS */}
              <Route
                path="/foods/:foodName"
                element={<FoodDetails />}
              />

              {/* ENVIRONMENTAL IMPACT */}
              <Route path="/impacts" element={<Impacts />} />

              {/* EXISTING DIETARY PREFERENCES */}
              <Route path="/diets" element={<Diets />} />

              {/* NEW CLIENT HEALTH PREFERENCES CRUD */}
              <Route
                path="/health-preferences"
                element={
                  <ClientOnly>
                    <HealthPreferences />
                  </ClientOnly>
                }
              />

              {/* PERSONALIZED RECOMMENDATIONS */}
              <Route
                path="/recommendations"
                element={<Recommendations />}
              />

              {/* AI ASSISTANT */}
              <Route
                path="/assistant"
                element={
                  <PlaceholderPage title="AI Assistant" />
                }
              />

              {/* ADMIN USER MANAGEMENT */}
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
