import { can, type MemberAccess } from "@/src/shared-kernel/access";
import { createVendorAttendanceHandlers } from "@/src/labour/infrastructure/vendor-attendance-factory";

/** One set of vendor attendance handlers for every route (CM-212, CM-213). */
export const vendorAttendanceHandlers = createVendorAttendanceHandlers();

/** Amounts on vendor attendance need Vendor (`labour.vendor`) Financial on the Project. */
export function vendorFinancial(
  access: MemberAccess,
  projectId: string,
): boolean {
  return can(access, "labour.vendor", "financial", { projectId });
}
