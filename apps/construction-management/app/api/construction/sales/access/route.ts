import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { salesDirectory } from "@/src/composition/sales-directory";
import { salesProjectNotFound } from "@/src/sales/domain/sales-errors";
import { can, menuByKey, type Flag } from "@/src/shared-kernel/access";
import { fromMask } from "@/src/shared-kernel/access/flags";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";

import {
  GetConstructionSalesAccessRequestModel,
  SALES_ACCESS_MENUS,
  type GetConstructionSalesAccessResponseModel,
} from "./access-models";

export const dynamic = "force-dynamic";

/**
 * What the caller may do in sales on a Project (M10), for screens to hide
 * actions: every supported flag of each sales menu that `can` grants on the
 * Project. 404 `PROJECT_NOT_FOUND` for a Project that is not a live Project
 * of the Company.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const url = new URL(request.url);
    const model = parseOrThrow(
      GetConstructionSalesAccessRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const project = await salesDirectory.project(
      prisma,
      session.workspaceId,
      model.projectId,
    );
    if (project == null) throw salesProjectNotFound();
    const access = await loadMemberAccess(prisma, session);
    const scope = { projectId: model.projectId };
    const menus = Object.fromEntries(
      SALES_ACCESS_MENUS.map((key) => {
        const supported = fromMask(menuByKey(key)?.supported ?? 0);
        return [
          key,
          supported.filter((flag: Flag) => can(access, key, flag, scope)),
        ];
      }),
    ) as GetConstructionSalesAccessResponseModel["menus"];
    const body: GetConstructionSalesAccessResponseModel = {
      projectId: model.projectId,
      structure: project.structure,
      menus,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
