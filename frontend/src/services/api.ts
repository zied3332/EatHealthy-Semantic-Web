
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
    "http://127.0.0.1:8000",

  timeout: 10000,

  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("eathealthy_access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
