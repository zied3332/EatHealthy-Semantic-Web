
import {
  BrowserRouter,
  Routes,
  Route,
} from "react-router-dom";

import AppLayout from "./components/layout/AppLayout";
import Home from "./pages/Home/Home";

// Temporary page component for modules under development
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div>
      <h1>{title}</h1>
      <p>This EatHealthy module is coming soon.</p>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          {/* Home page */}
          <Route path="/" element={<Home />} />

          {/* Health profile */}
          <Route
            path="/profile"
            element={<PlaceholderPage title="My Profile" />}
          />

          {/* Food Explorer */}
          <Route
            path="/foods"
            element={<PlaceholderPage title="Food Explorer" />}
          />

          {/* Dietary Preferences */}
          <Route
            path="/diets"
            element={<PlaceholderPage title="Dietary Preferences" />}
          />

          {/* Recommendations */}
          <Route
            path="/recommendations"
            element={<PlaceholderPage title="Recommendations" />}
          />

          {/* AI Assistant */}
          <Route
            path="/assistant"
            element={<PlaceholderPage title="AI Assistant" />}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
