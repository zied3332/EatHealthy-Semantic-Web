
import {
  BrowserRouter,
  Routes,
  Route,
} from "react-router-dom";

import AppLayout from "./components/layout/AppLayout";

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
          <Route
            path="/"
            element={<PlaceholderPage title="Welcome to EatHealthy" />}
          />
          <Route
            path="/profile"
            element={<PlaceholderPage title="My Profile" />}
          />
          <Route
            path="/foods"
            element={<PlaceholderPage title="Food Explorer" />}
          />
          <Route
            path="/diets"
            element={<PlaceholderPage title="Dietary Preferences" />}
          />
          <Route
            path="/recommendations"
            element={<PlaceholderPage title="Recommendations" />}
          />
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
