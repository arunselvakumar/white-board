"use client";

import { useQuery } from "@tanstack/react-query";

import {
  canInSiteWork,
  siteWorkAccessQuery,
} from "@/src/queries/site-work-access";

import { EQUIPMENT_TABS, equipmentModulePath } from "./equipment-tabs";

/**
 * The Equipment module's tabs as sidebar submenu links (M6, ADR CM-0020).
 * Access loads only while `enabled` (the submenu is open); until it does
 * every tab shows, then only those whose menus the viewer may read.
 */
export function useEquipmentNavLinks(projectId: string, enabled: boolean) {
  const access = useQuery({ ...siteWorkAccessQuery(projectId), enabled }).data;
  return EQUIPMENT_TABS.filter(
    (tab) =>
      access == null ||
      tab.menus.some((menu) => canInSiteWork(access, menu, "read")),
  ).map((tab) => ({
    href: equipmentModulePath(projectId, tab.segment),
    label: tab.label,
  }));
}
