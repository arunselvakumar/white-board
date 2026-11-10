"use client";

import { useAuth } from "@repo/auth/react";
import { useQuery } from "@tanstack/react-query";

import { dashboardQueries } from "@/src/queries/dashboard";

/**
 * How long the sidebar's figures may lag the register: the query refetches
 * on this interval, so an owner tab left open rolls over to the next day's
 * Batches by itself (the Owner Dashboard's reads share the cache).
 */
export const SIDEBAR_DASHBOARD_REFETCH_MS = 5 * 60 * 1000;

/**
 * The Owner Dashboard figures the sidebar shows (row counts, the Today
 * card). Owners only; `undefined` while it loads or when it fails (a failed
 * refetch too, which otherwise keeps the last answer), so the shell never
 * suspends and never shows a made-up number (ADR-0049).
 */
export function useSidebarDashboard() {
  const { role } = useAuth();
  const { data, isError } = useQuery({
    ...dashboardQueries.get(),
    enabled: role === "owner",
    refetchInterval: SIDEBAR_DASHBOARD_REFETCH_MS,
  });
  return role === "owner" && !isError ? data : undefined;
}
