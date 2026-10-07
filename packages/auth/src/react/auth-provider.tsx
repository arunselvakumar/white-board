"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { AuthSnapshot } from "../types";

const AuthContext = createContext<AuthSnapshot | null>(null);

/**
 * Hands the server's view of the Session to the browser (ADR-0034). The root
 * layout reads it per request, so `useAuth()` never has a loading state.
 * Signing in or out and switching Workspace reload the page to refresh it.
 */
export function AuthProvider({
  snapshot,
  children,
}: {
  snapshot: AuthSnapshot;
  children: ReactNode;
}) {
  return <AuthContext value={snapshot}>{children}</AuthContext>;
}

export function useAuthSnapshot(): AuthSnapshot {
  const snapshot = useContext(AuthContext);
  if (snapshot == null)
    throw new Error("Wrap the app in <AuthProvider> from @repo/auth/react.");
  return snapshot;
}
