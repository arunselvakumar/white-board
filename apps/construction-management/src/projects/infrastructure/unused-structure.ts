import type { StructureUsage } from "../domain/structure-repository";

/**
 * A `StructureUsage` that answers "not used": the default for unit tests.
 * The routes use `PrismaStructureUsage` (src/composition), which reads
 * every site record's `LocationRef` (ADR CM-0016 §7).
 */
export class UnusedStructure implements StructureUsage {
  usedFloorsAndUnits(): Promise<{ floorIds: string[]; unitIds: string[] }> {
    return Promise.resolve({ floorIds: [], unitIds: [] });
  }

  isWingUsed(): Promise<boolean> {
    return Promise.resolve(false);
  }

  isLocationUsed(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
