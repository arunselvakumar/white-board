import { prisma, type PrismaClient } from "@repo/construction-db";

import type {
  DomainEvent,
  DomainEventListener,
} from "@/src/shared-kernel/events";
import { newId } from "@/src/shared-kernel/ids";

import {
  SEED_AMENITIES,
  SEED_COMMON_DEVELOPMENTS,
} from "../domain/development-seeds";
import {
  DEVELOPMENT_KINDS,
  LOOKUP_KINDS,
  type DevelopmentKind,
  type LookupKind,
} from "../domain/master-kind";
import { lookupTable } from "./prisma-lookup-store";
import seeds from "./seeds/masters.json";

const SEED_NAMES: Record<LookupKind, readonly string[]> = {
  labour_category: seeds.labourCategories,
  department: seeds.departments,
};

const SEED_DEVELOPMENTS: Record<DevelopmentKind, readonly string[]> = {
  amenity: SEED_AMENITIES,
  common_development: SEED_COMMON_DEVELOPMENTS,
};

/** Every Company's Measurement Units (the 41 of `modules/02`), CM-501. */
export const SEED_MEASUREMENT_UNITS: readonly string[] = seeds.measurementUnits;

/** Every Company's starter Material Categories, all top-level (CM-501). */
export const SEED_MATERIAL_CATEGORIES: readonly string[] =
  seeds.materialCategories;

/** Every Company's starter Materials, by unit and category name (CM-501). */
export const SEED_MATERIALS: readonly {
  name: string;
  category: string;
  unit: string;
}[] = seeds.materials;

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** Live names of a Company's rows, lower case, for the idempotent seed. */
function takenNames(rows: { name: string }[]): Set<string> {
  return new Set(rows.map((row) => row.name.toLowerCase()));
}

/**
 * The procurement masters' seeds (CM-501): units, categories, then the
 * starter Materials pointing at them by name. A Company that already has a
 * live row of the name keeps its own; a starter Material whose unit is
 * gone is skipped.
 */
async function seedMaterialMasters(
  tx: Tx,
  input: { workspaceId: string; by: string; now: Date },
): Promise<void> {
  const stamp = {
    workspaceId: input.workspaceId,
    createdAt: input.now,
    updatedAt: input.now,
    createdBy: input.by,
    updatedBy: input.by,
  };
  const live = { workspaceId: input.workspaceId, deletedAt: null };
  const units = takenNames(
    await tx.constructionMastersMeasurementUnit.findMany({
      where: live,
      select: { name: true },
    }),
  );
  const newUnits = SEED_MEASUREMENT_UNITS.filter(
    (name) => !units.has(name.toLowerCase()),
  ).map((name) => ({
    id: newId(input.now.getTime()),
    name,
    isSeed: true,
    ...stamp,
  }));
  if (newUnits.length > 0)
    await tx.constructionMastersMeasurementUnit.createMany({
      data: newUnits,
      skipDuplicates: true,
    });

  const categories = takenNames(
    await tx.constructionMastersMaterialCategory.findMany({
      where: live,
      select: { name: true },
    }),
  );
  const newCategories = SEED_MATERIAL_CATEGORIES.filter(
    (name) => !categories.has(name.toLowerCase()),
  ).map((name) => ({
    id: newId(input.now.getTime()),
    name,
    isSeed: true,
    ...stamp,
  }));
  if (newCategories.length > 0)
    await tx.constructionMastersMaterialCategory.createMany({
      data: newCategories,
      skipDuplicates: true,
    });

  const materials = takenNames(
    await tx.constructionMastersMaterial.findMany({
      where: live,
      select: { name: true },
    }),
  );
  for (const seed of SEED_MATERIALS) {
    if (materials.has(seed.name.toLowerCase())) continue;
    const [unit, category] = await Promise.all([
      tx.constructionMastersMeasurementUnit.findFirst({
        where: { ...live, name: { equals: seed.unit, mode: "insensitive" } },
        select: { id: true },
      }),
      tx.constructionMastersMaterialCategory.findFirst({
        where: {
          ...live,
          name: { equals: seed.category, mode: "insensitive" },
        },
        select: { id: true },
      }),
    ]);
    if (unit == null) continue;
    await tx.constructionMastersMaterial.createMany({
      data: [
        {
          id: newId(input.now.getTime()),
          name: seed.name,
          uomId: unit.id,
          categoryId: category?.id ?? null,
          itemType: "consumable",
          ...stamp,
        },
      ],
      skipDuplicates: true,
    });
  }
}

/**
 * Copies the seed Labour Categories and Departments (CM-203), the
 * Amenities and Common Developments (CM-404) and the Measurement Units,
 * Material Categories and starter Materials (CM-501) to a Company.
 * Idempotent: names the Company already has (live, any case) are skipped,
 * so running it twice, or after the M2 migration's backfill, adds nothing.
 */
export async function seedCompanyMasters(
  db: PrismaClient,
  input: { workspaceId: string; by: string; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  await db.$transaction(async (tx) => {
    for (const kind of LOOKUP_KINDS) {
      const table = lookupTable(tx, kind);
      const existing = await table.findMany({
        where: { workspaceId: input.workspaceId, deletedAt: null },
        select: { name: true },
      });
      const taken = new Set(existing.map((row) => row.name.toLowerCase()));
      const data = SEED_NAMES[kind]
        .filter((name) => !taken.has(name.toLowerCase()))
        .map((name) => ({
          id: newId(now.getTime()),
          workspaceId: input.workspaceId,
          name,
          isSeed: true,
          createdAt: now,
          updatedAt: now,
          createdBy: input.by,
          updatedBy: input.by,
        }));
      if (data.length > 0)
        await table.createMany({ data, skipDuplicates: true });
    }
    for (const kind of DEVELOPMENT_KINDS) {
      const existing = await tx.constructionMastersDevelopmentType.findMany({
        where: { workspaceId: input.workspaceId, kind, deletedAt: null },
        select: { name: true },
      });
      const taken = new Set(existing.map((row) => row.name.toLowerCase()));
      const data = SEED_DEVELOPMENTS[kind]
        .filter((name) => !taken.has(name.toLowerCase()))
        .map((name) => ({
          id: newId(now.getTime()),
          workspaceId: input.workspaceId,
          kind,
          name,
          isSeed: true,
          createdAt: now,
          updatedAt: now,
          createdBy: input.by,
          updatedBy: input.by,
        }));
      if (data.length > 0)
        await tx.constructionMastersDevelopmentType.createMany({
          data,
          skipDuplicates: true,
        });
    }
    await seedMaterialMasters(tx, {
      workspaceId: input.workspaceId,
      by: input.by,
      now,
    });
  });
}

/** The shape of the organization context's `CompanyCreated` this listener reads. */
type CompanyCreatedEvent = DomainEvent & {
  type: "CompanyCreated";
  ownerUserId: string;
};

function isCompanyCreated(event: DomainEvent): event is CompanyCreatedEvent {
  return (
    event.type === "CompanyCreated" &&
    typeof (event as Partial<CompanyCreatedEvent>).ownerUserId === "string"
  );
}

/**
 * On `CompanyCreated`, gives the new Company its own copy of the seed lists.
 * The Company is already committed, so a failure is logged rather than
 * failing the creation; the seed is idempotent and can be run again.
 */
export class SeedCompanyMastersListener implements DomainEventListener {
  constructor(private readonly db: PrismaClient = prisma) {}

  async handle(event: DomainEvent): Promise<void> {
    if (!isCompanyCreated(event)) return;
    try {
      await seedCompanyMasters(this.db, {
        workspaceId: event.workspaceId,
        by: event.ownerUserId,
        now: event.occurredAt,
      });
    } catch (error) {
      console.error("Seeding masters for a new Company failed", error);
    }
  }
}
