import { PermissionSet, type Flag } from "@/src/shared-kernel/access";
import { newId } from "@/src/shared-kernel/ids";

import { Designation } from "../domain/designation";
import seeds from "./seeds/designations.json";

type SeedFile = {
  version: number;
  designations: { name: string; template?: "ALL" | Record<string, Flag[]> }[];
};

const SEEDS = seeds as SeedFile;

export const DESIGNATION_SEED_VERSION = SEEDS.version;

function templateOf(template: SeedFile["designations"][number]["template"]) {
  if (template == null) return null;
  if (template === "ALL") return PermissionSet.everything();
  return PermissionSet.fromGrants(template);
}

/** A fresh copy of the seed Designations for one Company (CM-106). */
export function seedDesignations(input: {
  workspaceId: string;
  by: string;
  now: Date;
}): Designation[] {
  return SEEDS.designations.map((seed) =>
    Designation.create({
      id: newId(input.now.getTime()),
      workspaceId: input.workspaceId,
      name: seed.name,
      template: templateOf(seed.template),
      isSeed: true,
      by: input.by,
      now: input.now,
    }),
  );
}

/** The raw seed grants, for the test that every cell is a supported one. */
export function seedTemplates(): {
  name: string;
  grants: Record<string, Flag[]>;
}[] {
  return SEEDS.designations.flatMap((seed) =>
    seed.template == null || seed.template === "ALL"
      ? []
      : [{ name: seed.name, grants: seed.template }],
  );
}
