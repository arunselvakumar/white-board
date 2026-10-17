/**
 * The tabs of a Project's Inquiries module (M10), in order: `segment` is
 * the path under `/app/projects/<id>/inquiries/`. Both need Inquiry Read;
 * Settings changes need Update (CM-1002).
 */
export const INQUIRY_TABS = [
  { segment: "list", label: "Inquiries" },
  { segment: "settings", label: "Settings" },
] as const;

export type InquiryTabSegment = (typeof INQUIRY_TABS)[number]["segment"];

export function inquiryModulePath(
  projectId: string,
  segment: InquiryTabSegment,
): string {
  return `/app/projects/${encodeURIComponent(projectId)}/inquiries/${segment}`;
}
