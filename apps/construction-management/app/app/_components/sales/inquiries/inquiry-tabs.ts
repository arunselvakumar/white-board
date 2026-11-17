import { type AppHref, pageHref } from "@/lib/page-href";

/**
 * The tabs of a Project's Inquiries module, in order: `segment` is the
 * path under `/app/projects/<id>/inquiries/`. Both need Inquiry Read;
 * Settings changes need Update.
 */
export const INQUIRY_TABS = [
  { segment: "list", label: "Inquiries" },
  { segment: "settings", label: "Settings" },
] as const;

export type InquiryTabSegment = (typeof INQUIRY_TABS)[number]["segment"];

/** Each tab's page, named by its folder (ADR CM-0045). */
const INQUIRY_TAB_PAGES: Record<InquiryTabSegment, (id: string) => AppHref> = {
  list: (id) => pageHref("/app/projects/[id]/inquiries/list", { id }),
  settings: (id) => pageHref("/app/projects/[id]/inquiries/settings", { id }),
};

export function inquiryModulePath(
  projectId: string,
  segment: InquiryTabSegment,
): AppHref {
  return INQUIRY_TAB_PAGES[segment](projectId);
}
