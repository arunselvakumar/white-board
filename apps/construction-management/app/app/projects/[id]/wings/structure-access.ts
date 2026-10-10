import { viewerCan } from "@/app/app/_lib/viewer-can";
import type { MenuKey } from "@/src/shared-kernel/access";

/** The signed-in Team Member's flags on a structure menu for one Project. */
export async function structureAccess(menu: MenuKey, projectId: string) {
  const [read, create, update, remove] = await Promise.all(
    (["read", "create", "update", "delete"] as const).map((flag) =>
      viewerCan(menu, flag, { projectId }),
    ),
  );
  return {
    read: read === true,
    create: create === true,
    update: update === true,
    delete: remove === true,
  };
}
