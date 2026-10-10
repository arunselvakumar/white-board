import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";

import {
  canOnProject,
  permissionDenied,
} from "../../stores/central-store-access";
import { centralStore } from "../../stores/central-store-wiring";
import {
  GetConstructionProcurementMaterialRequestFormOptionsRequestModel,
  type GetConstructionProcurementMaterialRequestFormOptionsResponseModel,
} from "../material-request-models";

export const dynamic = "force-dynamic";

/**
 * What the Material Request form offers on a Project: stores serving it
 * (Request To), its active Contractors and enabled Departments (Material
 * Requests create or update, and on the Project).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const { projectId } = parseOrThrow(
      GetConstructionProcurementMaterialRequestFormOptionsRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const access = await loadMemberAccess(prisma, session);
    if (
      !canOnProject(access, "create", projectId) &&
      !canOnProject(access, "update", projectId)
    )
      return permissionDenied();
    const [stores, parties] = await Promise.all([
      centralStore.stores.options(session.workspaceId, projectId),
      centralStore.partyOptions(session.workspaceId, projectId),
    ]);
    const body: GetConstructionProcurementMaterialRequestFormOptionsResponseModel =
      { stores, ...parties };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
