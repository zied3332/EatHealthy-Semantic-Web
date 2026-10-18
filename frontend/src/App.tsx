
import {
  BrowserRouter,
  Routes,
  Route,
} from "react-router-dom";

import AppLayout from "./components/layout/AppLayout";

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
      <Routes>
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
    </BrowserRouter>
  );
}

export default App;
