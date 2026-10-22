import { prisma } from "@repo/construction-db";

import { contractsDirectory } from "@/src/composition/contracts-directory";
import { messagingEvents } from "@/src/composition/messaging";
import { WorkOrderHandlers } from "@/src/contracts/application/work-order-handlers";
import type { WorkOrderDeps } from "@/src/contracts/application/work-order-ports";
import { PrismaBoqStore } from "@/src/contracts/infrastructure/prisma-boq-store";
import { PrismaWorkOrderStore } from "@/src/contracts/infrastructure/prisma-work-order-store";
import { readCompanyHeader } from "@/src/procurement/infrastructure/purchase-request-pdf";
import { companyToday } from "@/src/shared-kernel/company-today";
import { loadBackdatedCheck } from "@/src/site-work/infrastructure/site-work-guards";

/**
 * Work Orders (CM-1104) wired to Prisma, the BOQ store (its lock and
 * items), the contracts directory, the Back-dated Entry policy and
 * messaging: `document.submitted|approved|rejected` (approval type
 * `work_order`) and `WorkOrderIssued`.
 */
export function createWorkOrderDeps(): WorkOrderDeps {
  return {
    db: prisma,
    store: new PrismaWorkOrderStore(),
    boq: new PrismaBoqStore(),
    directory: contractsDirectory,
    backdated: (access) => loadBackdatedCheck(prisma, access),
    today: (workspaceId) => companyToday(prisma, workspaceId),
    events: messagingEvents(),
  };
}

/** One set of handlers for every Work Order route. */
export const workOrderHandlers = new WorkOrderHandlers(createWorkOrderDeps());

/**
 * What the Work Order PDF prints besides the Work Order: the Company's
 * letterhead, the Project's site address and the Contractor's address.
 * Plain reads of other contexts' tables, as the Purchase Order PDF does.
 */
export async function readWorkOrderPrintParties(
  workspaceId: string,
  projectId: string,
  contractorId: string,
): Promise<{
  company: Awaited<ReturnType<typeof readCompanyHeader>>;
  projectAddress: string | null;
  contractorAddress: string | null;
}> {
  const [company, project, contractor] = await Promise.all([
    readCompanyHeader(prisma, workspaceId),
    prisma.constructionProjectsProject.findFirst({
      where: { id: projectId, workspaceId },
      select: { address: true },
    }),
    prisma.constructionMastersContractor.findFirst({
      where: { id: contractorId, workspaceId },
      select: { address: true },
    }),
  ]);
  return {
    company,
    projectAddress: project?.address ?? null,
    contractorAddress: contractor?.address ?? null,
  };
}
