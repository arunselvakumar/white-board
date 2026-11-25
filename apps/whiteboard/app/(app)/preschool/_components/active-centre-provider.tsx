"use client";

/**
 * The Preschool screens' shared state (ADR-0055). Every page under
 * `/preschool` renders inside `ActiveCentreProvider` (the Preschool layout).
 *
 * - `useActiveCentre(): ActiveCentre` — `{ me, centre, centres, setCentreId }`.
 *   `me` is `PreschoolMe` (`/api/preschool/me`); `centre` is the active one of
 *   `centres` (the Centres the User may open); `setCentreId(id)` makes another
 *   one active, as Switch Centre in the sidebar does.
 * - `RoleGate({ roles, children, fallback? })` — renders `children` only for
 *   those Preschool roles, otherwise `fallback` or a no-access state.
 * - `PreschoolPage` (in `./preschool-page`) — the page frame and header.
 *
 * Children render only once `me` has loaded and the role may open the path;
 * a role that may not is sent to its own Home.
 */

import { ProhibitIcon } from "@phosphor-icons/react/ssr";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { EmptyState } from "@repo/ui/components/empty-state";

import { PageFallback } from "@/components/query-suspense";
import {
  pickActiveCentre,
  useActiveCentreId,
  writeActiveCentreId,
} from "@/lib/preschool-active-centre";
import {
  isAllowedPreschoolPath,
  preschoolHomeFor,
} from "@/lib/workspace-access";
import type { MeCentreView } from "@/src/preschool/application/me";
import {
  preschoolMeQueryOptions,
  type PreschoolMe,
  type PreschoolRole,
} from "@/src/queries/preschool/me";

import { PreschoolUnavailable } from "./preschool-unavailable";

export type PreschoolCentre = MeCentreView;

export type ActiveCentre = {
  me: PreschoolMe;
  /** The active Centre. */
  centre: PreschoolCentre;
  /** Every Centre the User may open, by name. */
  centres: readonly PreschoolCentre[];
  setCentreId: (id: string) => void;
};

const ActiveCentreContext = createContext<ActiveCentre | null>(null);

export function ActiveCentreProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/preschool";
  const router = useRouter();
  const {
    data: me,
    error,
    isPending,
    refetch,
  } = useQuery(preschoolMeQueryOptions());
  const rememberedId = useActiveCentreId();
  const allowed = me == null || isAllowedPreschoolPath(pathname, me.role);

  useEffect(() => {
    if (me != null && !allowed) router.replace(preschoolHomeFor(me.role));
  }, [allowed, me, router]);

  const value = useMemo<ActiveCentre | null>(() => {
    if (me == null) return null;
    const centre = pickActiveCentre(me.centres, rememberedId);
    return centre == null
      ? null
      : { me, centre, centres: me.centres, setCentreId: writeActiveCentreId };
  }, [me, rememberedId]);

  if (me == null) {
    if (isPending) return <PageFallback />;
    return (
      <PreschoolUnavailable
        error={error}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }
  if (!allowed) return <PageFallback />;
  if (value == null)
    return (
      <EmptyState
        className="m-4 w-auto border sm:m-6"
        icon={ProhibitIcon}
        tone="neutral"
        orbit={false}
        title="No Centre to open"
        description="You are not linked to an open Centre in this Preschool."
      />
    );
  return (
    <ActiveCentreContext.Provider value={value}>
      {children}
    </ActiveCentreContext.Provider>
  );
}

/** The signed-in User's Preschool, and the Centre they are working in. */
export function useActiveCentre(): ActiveCentre {
  const value = useContext(ActiveCentreContext);
  if (value == null)
    throw new Error("useActiveCentre needs the Preschool layout.");
  return value;
}

/** Renders `children` only for these Preschool roles. */
export function RoleGate({
  roles,
  children,
  fallback,
}: {
  roles: readonly PreschoolRole[];
  children: ReactNode;
  /** Defaults to a no-access state; pass `null` to render nothing. */
  fallback?: ReactNode;
}) {
  const { me } = useActiveCentre();
  if (roles.includes(me.role)) return children;
  if (fallback !== undefined) return fallback;
  return (
    <EmptyState
      size="md"
      icon={ProhibitIcon}
      tone="neutral"
      orbit={false}
      title="Not available to you"
      description="Your role in this Preschool cannot open this."
    />
  );
}
