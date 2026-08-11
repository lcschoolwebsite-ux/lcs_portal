import { createContext, useState, useEffect } from "react";
import api, { clearAuthToken, setAuthToken } from "../api/axios";
import {
  clearStudentSessionMarker,
  getActiveStudentProfile
} from "../services/studentSessions";
import { isNativeAndroidApp } from "../services/nativeBridge";

export const AuthContext = createContext(null);

const applyAuthSession = ({ token, user }) => {
  if (token) {
    setAuthToken(token);
    localStorage.setItem("token", token);
  }

  return user || null;
};

const hydrateCurrentUser = async (fallbackUser = null) => {
  try {
    const { data } = await api.get("/auth/me");
    return data || fallbackUser || null;
  } catch (_) {
    return fallbackUser || null;
  }
};

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      const restoreNativeStudentSession = async () => {
        if (!isNativeAndroidApp()) {
          setLoading(false);
          return;
        }

        try {
          const activeProfile = await getActiveStudentProfile();
          if (!activeProfile?.token || !activeProfile?.user) {
            setLoading(false);
            return;
          }

          setUser(applyAuthSession({ token: activeProfile.token, user: activeProfile.user }));
        } catch (_) {
          // If the quick-login cache is unavailable, fall back to the login screen.
        } finally {
          setLoading(false);
        }
      };

      restoreNativeStudentSession();
      return;
    }
    setAuthToken(token);
    api.get("/auth/me")
      .then(r => setUser(r.data))
      .catch(() => {
        clearAuthToken();
        localStorage.removeItem("token");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (role, username, password) => {
    const { data } = await api.post("/auth/login", { 
      role, 
      username, 
      password 
    });
    const sessionUser = applyAuthSession(data);
    const hydratedUser = await hydrateCurrentUser(sessionUser);
    setUser(hydratedUser);
    return {
      ...data,
      user: hydratedUser
    };
  };

  const restoreSession = async ({ token, user: nextUser }) => {
    const sessionUser = applyAuthSession({ token, user: nextUser });
    const hydratedUser = await hydrateCurrentUser(sessionUser);
    setUser(hydratedUser);
    return hydratedUser;
  };

  const logout = () => {
    clearAuthToken();
    localStorage.removeItem("token");
    clearStudentSessionMarker().catch(() => {});
    setUser(null);
  };

  const updateUser = nextUser => {
    setUser(nextUser);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser, restoreSession }}>
      {children}
    </AuthContext.Provider>
  );
}
