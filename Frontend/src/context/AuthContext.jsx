import { useCallback, useEffect, useMemo, useState } from "react";

import { authAPI, setUnauthorizedHandler } from "../services/api";
import { AuthContext } from "./auth-context";

const readStoredUser = () => {
  const raw = localStorage.getItem("user");
  const token = localStorage.getItem("token");
  if (!raw || !token) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.email ? parsed : null;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(readStoredUser);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    authAPI.logout();
    setUser(null);
  }, []);

  // A 401 from anywhere clears React state instead of hard-reloading the page.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  // Confirm the stored token is still valid rather than trusting localStorage.
  // Without this, an expired or revoked token renders the whole dashboard and
  // only fails once the first API call comes back 401.
  useEffect(() => {
    let cancelled = false;

    const verify = async () => {
      if (!localStorage.getItem("token")) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const profile = await authAPI.me();
        if (cancelled) return;
        if (profile) {
          const fresh = {
            userId: profile.userId,
            name: profile.name,
            email: profile.email,
            role: profile.role,
          };
          localStorage.setItem("user", JSON.stringify(fresh));
          setUser(fresh);
        }
      } catch (err) {
        // 401 already cleared the session; anything else (server down) should
        // not sign the user out mid-demo.
        if (!cancelled && err.status === 401) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    verify();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback((payload) => {
    const { token, user: nextUser } = payload || {};
    if (!token || !nextUser) {
      throw new Error("Unexpected login response from the server");
    }
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(nextUser));
    setUser(nextUser);
    return nextUser;
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout: clearSession,
      isAdmin: user?.role === "admin",
    }),
    [user, loading, login, clearSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
