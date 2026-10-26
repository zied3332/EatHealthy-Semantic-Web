import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import api from "../services/api";

export interface AuthUser {
  id?: string;
  username?: string;
  role: "client" | "admin";
  person?: string;
}

interface AuthResponse {
  access_token: string;
  token_type: string;
  username: string;
  role: "client" | "admin";
  person: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (data: Record<string, string | number>) => Promise<void>;
  logout: () => void;
}

const TOKEN_KEY = "eathealthy_access_token";
const USER_KEY = "eathealthy_user";

const AuthContext = createContext<AuthContextValue | null>(null);

function readUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

function saveAuth(response: AuthResponse) {
  localStorage.setItem(TOKEN_KEY, response.access_token);
  const user: AuthUser = {
    username: response.username,
    role: response.role,
    person: response.person,
  };
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(readUser);

  async function login(username: string, password: string) {
    const response = await api.post<AuthResponse>("/api/users/login", {
      username,
      password,
    });
    const nextUser = saveAuth(response.data);
    setToken(response.data.access_token);
    setUser(nextUser);
  }

  async function register(data: Record<string, string | number>) {
    const response = await api.post<AuthResponse>(
      "/api/users/register",
      data
    );
    const nextUser = saveAuth(response.data);
    setToken(response.data.access_token);
    setUser(nextUser);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }

  const value = useMemo(
    () => ({ user, token, login, register, logout }),
    [user, token]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
