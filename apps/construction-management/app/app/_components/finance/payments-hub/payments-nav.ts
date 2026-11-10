"use client";

import { useQuery } from "@tanstack/react-query";

import { canInFinance, financeAccessQuery } from "@/src/queries/finance-access";

import { PAYMENTS_TABS, paymentsPath } from "./payments-tabs";

/**
 * The Payments module's tabs as sidebar submenu links (M7, ADR CM-0020).
 * Access loads only while `enabled` (the submenu is open); until it does
 * every tab shows, then only those whose menu the viewer may read.
 */
export function usePaymentsNavLinks(projectId: string, enabled: boolean) {
  const access = useQuery({ ...financeAccessQuery(projectId), enabled }).data;
  return PAYMENTS_TABS.filter(
    (tab) =>
      access == null ||
      tab.menus.some((menu) => canInFinance(access, menu, "read")),
  ).map((tab) => ({
    href: paymentsPath(projectId, tab.segment),
    label: tab.label,
  }));
}
