import { prisma, type PrismaClient } from "@repo/db";

import type {
  DomainEvent,
  DomainEventListener,
} from "@/src/shared-kernel/events";
import { newId } from "@/src/shared-kernel/ids";

import { LOOKUP_KINDS, type LookupKind } from "../domain/master-kind";
import { lookupTable } from "./prisma-lookup-store";
import seeds from "./seeds/masters.json";

const SEED_NAMES: Record<LookupKind, readonly string[]> = {
  labour_category: seeds.labourCategories,
  department: seeds.departments,
};

/**
 * Copies the seed Labour Categories and Departments to a Company (CM-203).
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
