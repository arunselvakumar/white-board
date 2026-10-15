"use client";

import { useQuery } from "@tanstack/react-query";

import {
  canIn,
  procurementAccessQuery,
} from "@/src/queries/procurement-access";

import { MATERIALS_TABS, materialsPath } from "./materials-tabs";

/**
 * The Materials module's tabs as sidebar submenu links (M5, ADR CM-0020).
 * Access loads only while `enabled` (the submenu is open); until it does
 * every tab shows, then only those whose menu the viewer may read.
 */
export function useMaterialsNavLinks(projectId: string, enabled: boolean) {
  const access = useQuery({
    ...procurementAccessQuery(projectId),
    enabled,
  }).data;
  return MATERIALS_TABS.filter(
    (tab) => access == null || canIn(access, tab.menu, "read"),
  ).map((tab) => ({
    href: materialsPath(projectId, tab.segment),
    label: tab.label,
  }));
}
