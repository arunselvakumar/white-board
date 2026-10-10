import type { StructureUsage } from "../domain/structure-repository";

/**
 * The `StructureUsage` of M4: nothing points at floors, units, Wings or
 * Locations yet, so every answer is "not used". Daily Work (M6), Tasks,
 * Issues and Inspections (M8) and Booking (M10) replace it with a reader
 * of their own tables by id, as `PrismaProjectUsage` reads the labour
 * context's, so removing a referenced row is refused.
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
