
import axios from "axios";

/**
 * Shared HTTP client for the EatHealthy backend.
 *
 * All frontend modules should use this instance
 * instead of creating their own Axios clients.
 */
const api = axios.create({
  baseURL:
    import.meta.env.VITE_API_URL ||
    "http://localhost:8000",

  timeout: 10000,

  headers: {
    "Content-Type": "application/json",
  },
});

export default api;
