
import {
  BrowserRouter,
  Routes,
  Route,
} from "react-router-dom";

import AppLayout from "./components/layout/AppLayout";

// ============================================================
// CONTEXT PROVIDERS
// ============================================================

// Shared semantic user profile state.
// Makes the selected user and their RDF relationships
// available throughout the React application.
import { ProfileProvider } from "./context/ProfileContext";

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

// ============================================================
// TEMPORARY PLACEHOLDER
// ============================================================

// Used for modules that are still under development.
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

function App() {
  return (
    <BrowserRouter>
      {/* Shared profile data for all application pages */}
      <ProfileProvider>
        <Routes>
          {/* All pages share the same application layout */}
          <Route element={<AppLayout />}>

            {/* HOME */}
            <Route
              path="/"
              element={<Home />}
            />

            {/* HEALTH PROFILE */}
            <Route
              path="/profile"
              element={<Profile />}
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

            {/* DIETARY PREFERENCES */}
            <Route
              path="/diets"
              element={<Diets />}
            />

            {/* PERSONALIZED RECOMMENDATIONS */}
            <Route
              path="/recommendations"
              element={
                <PlaceholderPage title="Recommendations" />
              }
            />

            {/* AI ASSISTANT */}
            <Route
              path="/assistant"
              element={
                <PlaceholderPage title="AI Assistant" />
              }
            />

          </Route>
        </Routes>
      </ProfileProvider>
    </BrowserRouter>
  );
}

export default App;
