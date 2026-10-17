import type { AccessSession } from "@/app/api/_lib/require-access";
import { requireSalesRecordAccess } from "@/app/api/construction/sales/sales-access";
import { inquiryHandlers } from "@/src/composition/sales-inquiries";
import type { StoredInquiry } from "@/src/sales/application/inquiry-handlers";
import type { Flag } from "@/src/shared-kernel/access";

export const INQUIRY_MENU = "sales.inquiries";

export { inquiryHandlers };

/**
 * The Session plus the Permission Matrix check for a route about one
 * inquiry: it is loaded first (404 for another Company's or a deleted
 * one), then `flag` is checked on its Project. View all is the handlers'
 * check (404 for an inquiry the caller may not see).
 */
export function requireInquiryAccess(
  request: Request,
  id: string,
  flag: Flag,
): Promise<(AccessSession & { target: StoredInquiry }) | Response> {
  return requireSalesRecordAccess(request, INQUIRY_MENU, flag, (workspaceId) =>
    inquiryHandlers.find(workspaceId, id),
  );
}

// CM-1004: follow-ups and Inquiry Tasks.
export { inquiryActivityHandlers } from "@/src/composition/sales-inquiries";
