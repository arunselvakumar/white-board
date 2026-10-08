import type { PermissionGrants } from "@/src/shared-kernel/access";

import type { Designation } from "../domain/designation";

export type DesignationReadModel = {
  id: string;
  name: string;
  isSeed: boolean;
  template: PermissionGrants | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toDesignationReadModel(
  item: Designation,
): DesignationReadModel {
  return {
    id: item.id,
    name: item.name,
    isSeed: item.isSeed,
    template: item.template?.toGrants() ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
