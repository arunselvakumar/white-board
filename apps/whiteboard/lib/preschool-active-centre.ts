import { useSyncExternalStore } from "react";

/**
 * The Centre the User last picked in a Preschool Workspace (ADR-0055). A
 * cookie, not storage, so a server page can read the same choice; it is
 * readable by the page and holds only a Centre id.
 */
export const PRESCHOOL_CENTRE_COOKIE = "wb_preschool_centre";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

const listeners = new Set<() => void>();

/** The id in a `Cookie` header or `document.cookie`, or null. */
export function centreIdFromCookieHeader(
  header: string | null | undefined,
): string | null {
  if (header == null) return null;
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === PRESCHOOL_CENTRE_COOKIE) {
      const id = decodeURIComponent(value.join("="));
      return id === "" ? null : id;
    }
  }
  return null;
}

function readCookie(): string | null {
  return typeof document === "undefined"
    ? null
    : centreIdFromCookieHeader(document.cookie);
}

/** Remembers the picked Centre and tells every reader. */
export function writeActiveCentreId(id: string): void {
  document.cookie = `${PRESCHOOL_CENTRE_COOKIE}=${encodeURIComponent(id)}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The remembered Centre id; null on the server and during hydration. */
export function useActiveCentreId(): string | null {
  return useSyncExternalStore(subscribe, readCookie, () => null);
}

/**
 * The active Centre: the remembered one when the User may still open it,
 * otherwise the first open Centre, otherwise the first.
 */
export function pickActiveCentre<Centre extends { id: string; status: string }>(
  centres: readonly Centre[],
  rememberedId: string | null,
): Centre | null {
  return (
    centres.find((centre) => centre.id === rememberedId) ??
    centres.find((centre) => centre.status === "active") ??
    centres[0] ??
    null
  );
}
