import type { RoleActions } from "@/components/roles/role-actions";

import { viewerFlags } from "../../_lib/viewer-can";

/** What the viewer may do on Role Management, for the pages to hide the rest. */
export async function viewerRoleActions(): Promise<RoleActions> {
  return viewerFlags("organization.roles", ["create", "update", "delete"]);
}
