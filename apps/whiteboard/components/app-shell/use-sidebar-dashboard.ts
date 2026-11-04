"use client";

import { useAuth } from "@repo/auth/react";
import { useQuery } from "@tanstack/react-query";

import { dashboardQueries } from "@/src/queries/dashboard";

/**
 * The Owner Dashboard figures the sidebar shows (row counts, the Today
 * card). Owners only; `undefined` while it loads or when it fails, so the
 * shell never suspends and never shows a made-up number (ADR-0049).
 */
export function useSidebarDashboard() {
  const { role } = useAuth();
  const { data } = useQuery({
    ...dashboardQueries.get(),
    enabled: role === "owner",
  });
  return role === "owner" ? data : undefined;
}
