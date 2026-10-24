import { isMenuKey } from "@/src/shared-kernel/access";
import type { RoleActions } from "@/components/roles/role-actions";

import { viewerFlags } from "../../_lib/viewer-can";

/** Role Management's menu (ADR CM-0029 §1); its catalogue entry is code. */
const ROLES_MENU: string = "organization.roles";

/** What the viewer may do on Role Management, for the pages to hide the rest. */
export async function viewerRoleActions(): Promise<RoleActions> {
  if (!isMenuKey(ROLES_MENU))
    return { create: false, update: false, delete: false };
  return viewerFlags(ROLES_MENU, ["create", "update", "delete"]);
}
