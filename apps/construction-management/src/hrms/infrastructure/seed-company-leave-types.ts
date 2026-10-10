import { prisma, type PrismaClient } from "@repo/construction-db";

import type {
  DomainEvent,
  DomainEventListener,
} from "@/src/shared-kernel/events";

import { seedCompanyLeaveTypes } from "./prisma-leave-type-store";

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
 * On `CompanyCreated`, gives the new Company its own copy of the six seed
 * leave types (CM-310, `seeds/leave-types.json`). Companies created before
 * M3 got them from the migration
 * `20261010140000_construction_hrms_leave_type_seeds`. The Company is
 * already committed, so a failure is logged rather than failing the
 * creation; the seed is idempotent and can be run again.
 */
export class SeedCompanyLeaveTypesListener implements DomainEventListener {
  constructor(private readonly db: PrismaClient = prisma) {}

  async handle(event: DomainEvent): Promise<void> {
    if (!isCompanyCreated(event)) return;
    try {
      await seedCompanyLeaveTypes(this.db, {
        workspaceId: event.workspaceId,
        by: event.ownerUserId,
        now: event.occurredAt,
      });
    } catch (error) {
      console.error("Seeding leave types for a new Company failed", error);
    }
  }
}
