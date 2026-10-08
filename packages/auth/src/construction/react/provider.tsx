"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { CompanyAuthSnapshot } from "../types";

const CompanyAuthContext = createContext<CompanyAuthSnapshot | null>(null);

/**
 * Hands the server's view of the Session to the browser. The root layout
 * reads it per request, so the hooks never have a loading state. Signing in
 * or out and switching Company reload the page to refresh it.
 */
export function CompanyAuthProvider({
  snapshot,
  children,
}: {
  snapshot: CompanyAuthSnapshot;
  children: ReactNode;
}) {
  return <CompanyAuthContext value={snapshot}>{children}</CompanyAuthContext>;
}

export function useCompanyAuthSnapshot(): CompanyAuthSnapshot {
  const snapshot = useContext(CompanyAuthContext);
  if (snapshot == null)
    throw new Error(
      "Wrap the app in <CompanyAuthProvider> from @repo/auth/construction/react.",
    );
  return snapshot;
}
