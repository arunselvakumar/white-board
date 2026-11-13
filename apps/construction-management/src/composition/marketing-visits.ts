import { prisma } from "@repo/construction-db";

import { VisitHandlers } from "@/src/marketing/application/visit-handlers";
import { prismaProspectCompanyStore } from "@/src/marketing/infrastructure/prisma-prospect-company-store";
import { PrismaVisitFileStore } from "@/src/marketing/infrastructure/prisma-visit-file-store";
import { prismaVisitStore } from "@/src/marketing/infrastructure/prisma-visit-store";
import { readAuditEvents } from "@/src/shared-kernel/audit-reader";
import {
  assertCanCreate,
  assertCanEdit,
} from "@/src/shared-kernel/backdated-policy";
import {
  loadBackdatedActor,
  loadBackdatedPolicy,
} from "@/src/shared-kernel/backdated-policy-reader";
import { todayIn } from "@/src/shared-kernel/calendar-date";
import {
  companyTimezone,
  companyToday,
} from "@/src/shared-kernel/company-today";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import { zoneInstant } from "@/src/shared-kernel/zone-time";
import { nextSequenceNumber } from "@/src/shared-kernel/sequence/next-sequence-number";

import { prospectCompanyHandlers } from "./marketing-companies";
import { marketingTeam } from "./marketing-team";

/**
 * Visit handlers (ADR CM-0040 §7) wired to Prisma, the Prospect Company
 * handlers, the team, the `marketing_visit` back-dated limits and sequence,
 * the audit trail for each Visit's history, and storage for the files a
 * deleted Visit leaves.
 */
export function createVisitHandlers(): VisitHandlers {
  return new VisitHandlers({
    db: prisma,
    store: prismaVisitStore,
    fileStore: new PrismaVisitFileStore(prisma),
    storage: objectStorage(),
    companyStore: prismaProspectCompanyStore,
    companies: prospectCompanyHandlers,
    team: marketingTeam,
    async backdated(access) {
      const [policy, actor, today] = await Promise.all([
        loadBackdatedPolicy(prisma, access.workspaceId),
        loadBackdatedActor(prisma, access),
        companyToday(prisma, access.workspaceId),
      ]);
      return (action, date) => {
        if (action === "create")
          assertCanCreate(policy, "marketing_visit", date, actor, today);
        else assertCanEdit(policy, "marketing_visit", date, actor, today);
      };
    },
    timeZone: (workspaceId) => companyTimezone(prisma, workspaceId),
    dateIn: (instant, timeZone) => todayIn(timeZone, instant),
    dayStart: (date, timeZone) => zoneInstant(date, 0, timeZone),
    async nextNumber(tx, input) {
      const allocated = await nextSequenceNumber(tx, {
        ...input,
        module: "marketing_visit",
        projectId: null,
      });
      return { number: allocated.number, sequence: allocated.sequence };
    },
    history: (workspaceId, visitId) =>
      readAuditEvents(prisma, {
        workspaceId,
        entityType: "marketing_visit",
        entityIds: [visitId],
      }),
  });
}

/** One set of handlers for every Visit route. */
export const visitHandlers = createVisitHandlers();
