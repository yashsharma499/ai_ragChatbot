import { createContext, useContext } from "react";

/**
 * The context object and its hook live apart from the provider component so
 * the provider file only exports components — which is what React Fast Refresh
 * requires to hot-reload it reliably.
 */
export const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside an <AuthProvider>");
  }
  return context;
}
