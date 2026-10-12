import { prisma, type PrismaClient } from "@repo/construction-db";

import { calendarDateToDb } from "@/src/shared-kernel/calendar-date";
import { companyToday } from "@/src/shared-kernel/company-today";
import type {
  DomainEvent,
  DomainEventListener,
} from "@/src/shared-kernel/events";
import { newId } from "@/src/shared-kernel/ids";

import { ACCOUNT_SEEDS, PAYMENT_CATEGORY_SEEDS } from "./finance-seeds";

/**
 * Gives a Company its two company accounts (Cash primary, Bank) and the
 * Payment Categories (ADR CM-0017 §2). Idempotent: a live row of the same
 * name (any case) is kept, and no second primary is made. Opening balances
 * are zero, so no ledger entry is written.
 */
export async function seedCompanyFinance(
  db: PrismaClient,
  input: { workspaceId: string; by: string; now: Date },
): Promise<void> {
  const { workspaceId, by, now } = input;
  await db.$transaction(async (tx) => {
    const accounts = await tx.constructionFinanceAccount.findMany({
      where: { workspaceId, deletedAt: null },
      select: { name: true, isPrimary: true },
    });
    const taken = new Set(accounts.map((row) => row.name.toLowerCase()));
    let hasPrimary = accounts.some((row) => row.isPrimary);
    const openingDate = calendarDateToDb(
      await companyToday(tx, workspaceId, now),
    );
    for (const seed of ACCOUNT_SEEDS) {
      if (taken.has(seed.name.toLowerCase())) continue;
      const isPrimary = seed.isPrimary && !hasPrimary;
      hasPrimary ||= isPrimary;
      await tx.constructionFinanceAccount.create({
        data: {
          id: newId(),
          workspaceId,
          kind: seed.kind,
          name: seed.name,
          isPrimary,
          openingDate,
          isSeed: true,
          createdAt: now,
          updatedAt: now,
          createdBy: by,
          updatedBy: by,
        },
      });
    }

    const categories = await tx.constructionFinancePaymentCategory.findMany({
      where: { workspaceId, deletedAt: null },
      select: { name: true },
    });
    const takenCategories = new Set(
      categories.map((row) => row.name.toLowerCase()),
    );
    const missing = PAYMENT_CATEGORY_SEEDS.filter(
      (name) => !takenCategories.has(name.toLowerCase()),
    );
    if (missing.length > 0)
      await tx.constructionFinancePaymentCategory.createMany({
        data: missing.map((name) => ({
          id: newId(),
          workspaceId,
          name,
          isSeed: true,
          createdAt: now,
          updatedAt: now,
          createdBy: by,
          updatedBy: by,
        })),
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
 * On `CompanyCreated`, gives the new Company its finance seeds. The Company
 * is already committed, so a failure is logged rather than failing the
 * creation; the seed is idempotent and can be run again.
 */
export class SeedCompanyFinanceListener implements DomainEventListener {
  constructor(private readonly db: PrismaClient = prisma) {}

  async handle(event: DomainEvent): Promise<void> {
    if (!isCompanyCreated(event)) return;
    try {
      await seedCompanyFinance(this.db, {
        workspaceId: event.workspaceId,
        by: event.ownerUserId,
        now: event.occurredAt,
      });
    } catch (error) {
      console.error("Seeding finance for a new Company failed", error);
    }
  }
}
