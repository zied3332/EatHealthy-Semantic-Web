
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

// Shared semantic user profile state.
// Makes the selected user and their RDF relationships
// available throughout the React application.
import { ProfileProvider } from "./context/ProfileContext";
import { AuthProvider, useAuth } from "./context/AuthContext";

// ============================================================
// PAGES
// ============================================================

// Home
import Home from "./pages/Home/Home";

// Health Profile - connected to FastAPI and Fuseki
import Profile from "./pages/Profile/Profile";

// Food Explorer
import Foods from "./pages/Foods/Foods";

// Food Details - semantic nutritional information
import FoodDetails from "./pages/FoodDetails/FoodDetails";

// Dietary Preferences - connected to FastAPI and Fuseki
import Diets from "./pages/Diets/Diets";

// Personalized Recommendations - SPARQL-powered food matching
import Recommendations from "./pages/Recommendations/Recommendations";
import Login from "./pages/Auth/Login";
import Register from "./pages/Auth/Register";
import AdminUsers from "./pages/AdminUsers/AdminUsers";
import ProfileEdit from "./pages/ProfileEdit/ProfileEdit";
import Impacts from "./pages/Impacts/Impacts";
import Nutrients from "./pages/Nutrients/Nutrients";
import Meals from "./pages/Meals/Meals";

// ============================================================
// TEMPORARY PLACEHOLDER
// ============================================================

// Used for modules that are still under development.
// Currently only the AI Assistant uses this placeholder.
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div>
      <h1>{title}</h1>
      <p>This EatHealthy module is coming soon.</p>
    </div>
  );
}

// ============================================================
// APPLICATION ROUTES
// ============================================================

function ProtectedLayout() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return user.role === "admin" ? <AppLayout /> : <ClientLayout />;
}

function NutrientFoodRedirect() {
  const { foodName } = useParams();
  return <Navigate to={`/foods/${encodeURIComponent(foodName || "")}`} replace />;
}

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
            <Route path="/foods/:foodName/nutrients" element={<NutrientFoodRedirect />} />
            {/* HEALTH PROFILE */}
            <Route
              path="/profile"
              element={<Profile />}
            />
            <Route
              path="/profile/edit"
              element={<ProfileEdit />}
            />

            {/* FOOD EXPLORER */}
            <Route
              path="/foods"
              element={<Foods />}
            />

            {/* FOOD DETAILS */}
            {/* Example: /foods/Pomme */}
            <Route
              path="/foods/:foodName"
              element={<FoodDetails />}
            />

            {/* ENVIRONMENTAL IMPACT */}
            <Route
              path="/impacts"
              element={<Impacts />}
            />

            {/* DIETARY PREFERENCES */}
            <Route
              path="/diets"
              element={<Diets />}
            />

            {/* PERSONALIZED RECOMMENDATIONS */}
            {/* Uses the selected user from ProfileContext */}
            <Route
              path="/recommendations"
              element={<Recommendations />}
            />

            {/* AI ASSISTANT */}
            {/* Planned future module */}
            <Route
              path="/assistant"
              element={
                <PlaceholderPage title="AI Assistant" />
              }
            />
            <Route path="/admin/users" element={<AdminUsers />} />
          </Route>
        </Routes>
        </ProfileProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
