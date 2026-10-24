import { PermissionSet, type Flag } from "@/src/shared-kernel/access";
import { newId } from "@/src/shared-kernel/ids";

import { Role } from "../domain/role";
import seeds from "./seeds/roles.json";

type SeedFile = {
  version: number;
  roles: {
    name: string;
    description?: string | null;
    /** "ALL" is every supported cell of every menu, menus added later too. */
    permissions: "ALL" | Record<string, Flag[]>;
  }[];
};

const SEEDS = seeds as SeedFile;

export const ROLE_SEED_VERSION = SEEDS.version;

/** The seed Role Add User preselects for an HRMS Team Member. */
export const HRMS_STAFF_ROLE = "HRMS Staff";

function permissionsOf(seed: SeedFile["roles"][number]): PermissionSet {
  return seed.permissions === "ALL"
    ? PermissionSet.everything()
    : PermissionSet.fromGrants(seed.permissions);
}

/** A fresh copy of the seed Roles for one Company (ADR CM-0030 §5). */
export function seedRoles(input: {
  workspaceId: string;
  by: string;
  now: Date;
}): Role[] {
  return SEEDS.roles.map((seed) =>
    Role.create({
      id: newId(input.now.getTime()),
      workspaceId: input.workspaceId,
      name: seed.name,
      description: seed.description ?? null,
      permissions: permissionsOf(seed),
      isSeed: true,
      by: input.by,
      now: input.now,
    }),
  );
}

/** The raw seed grants, for the test that every cell is a supported one. */
export function seedRoleGrants(): {
  name: string;
  grants: Record<string, Flag[]>;
}[] {
  return SEEDS.roles.flatMap((seed) =>
    seed.permissions === "ALL"
      ? []
      : [{ name: seed.name, grants: seed.permissions }],
  );
}
