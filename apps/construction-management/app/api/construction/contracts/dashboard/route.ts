import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { readContractsDashboard } from "@/src/composition/contracts-dashboard";
import { contractsDirectory } from "@/src/composition/contracts-directory";
import { contractsProjectNotFound } from "@/src/contracts/domain/contracts-errors";

import {
  GetConstructionContractsDashboardRequestModel,
  toContractsDashboardResponse,
} from "./dashboard-models";

export const dynamic = "force-dynamic";

/**
 * The Project Dashboard's Contracts section (CM-1111): billed to date
 * against the BOQ, receivable and payable, retention held both ways,
 * issued Work Orders and bills pending approval — as on today. Behind
 * Dashboard Read on the Project (404 for one that is not a live Project
 * of the Company); each part needs its own menu's read and its money that
 * menu's Financial.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      GetConstructionContractsDashboardRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireAccess(
      request,
      "reporting.project_dashboard",
      "read",
      { projectId: model.projectId },
    );
    if (isResponse(session)) return session;
    const project = await contractsDirectory.project(
      prisma,
      session.workspaceId,
      model.projectId,
    );
    if (project == null) throw contractsProjectNotFound();
    return Response.json(
      toContractsDashboardResponse(
        model.projectId,
        await readContractsDashboard(session.access, model.projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
