import { newId } from "@/src/shared-kernel/ids";

import { Designation } from "../domain/designation";
import seeds from "./seeds/designations.json";

type SeedFile = {
  version: number;
  designations: { name: string }[];
};

const SEEDS = seeds as SeedFile;

export const DESIGNATION_SEED_VERSION = SEEDS.version;

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
      isSeed: true,
      by: input.by,
      now: input.now,
    }),
  );
}
