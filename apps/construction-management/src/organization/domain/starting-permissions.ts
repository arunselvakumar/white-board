import {
  PermissionSet,
  hrmsDefaultPermissions,
} from "@/src/shared-kernel/access";

import type { Designation } from "./designation";

export type MemberType = "normal" | "hrms";

/**
 * The matrix a new Team Member starts with (ADR CM-0003): HRMS members get
 * the HRMS default set; others get a copy of their Designation's template,
 * or nothing.
 */
export function applyTemplate(
  designation: Designation | null,
  memberType: MemberType,
): PermissionSet {
  if (memberType === "hrms") return hrmsDefaultPermissions();
  return designation?.template ?? PermissionSet.empty();
}
