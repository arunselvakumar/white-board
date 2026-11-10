"use client";

import { useQuery } from "@tanstack/react-query";

import { canInSales, salesAccessQuery } from "@/src/queries/sales-access";

import { INQUIRY_TABS, inquiryModulePath } from "./inquiry-tabs";

/**
 * The Inquiries module's tabs as sidebar submenu links (M10, ADR CM-0020).
 * Access loads only while `enabled` (the submenu is open); until it does
 * every tab shows, then only when the viewer may read inquiries.
 */
export function useInquiryNavLinks(projectId: string, enabled: boolean) {
  const access = useQuery({ ...salesAccessQuery(projectId), enabled }).data;
  if (access != null && !canInSales(access, "sales.inquiries", "read"))
    return [];
  return INQUIRY_TABS.map((tab) => ({
    href: inquiryModulePath(projectId, tab.segment),
    label: tab.label,
  }));
}
