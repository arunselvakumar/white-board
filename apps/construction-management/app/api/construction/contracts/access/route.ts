import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { contractsDirectory } from "@/src/composition/contracts-directory";
import { contractsProjectNotFound } from "@/src/contracts/domain/contracts-errors";
import { can, menuByKey, type Flag } from "@/src/shared-kernel/access";
import { fromMask } from "@/src/shared-kernel/access/flags";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";

import {
  CONTRACTS_ACCESS_MENUS,
  GetConstructionContractsAccessRequestModel,
  type GetConstructionContractsAccessResponseModel,
} from "./access-models";

export const dynamic = "force-dynamic";

/**
 * What the caller may do in contracts on a Project (M11), for screens to
 * hide actions: every supported flag of each contracts menu that `can`
 * grants. The Project menus also need the Team Member on the Project; the
 * Item Library is Company-wide. 404 `PROJECT_NOT_FOUND` for a Project that
 * is not a live Project of the Company.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const url = new URL(request.url);
    const model = parseOrThrow(
      GetConstructionContractsAccessRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const project = await contractsDirectory.project(
      prisma,
      session.workspaceId,
      model.projectId,
    );
    if (project == null) throw contractsProjectNotFound();
    const access = await loadMemberAccess(prisma, session);
    const scope = { projectId: model.projectId };
    const menus = Object.fromEntries(
      CONTRACTS_ACCESS_MENUS.map((key) => {
        const supported = fromMask(menuByKey(key)?.supported ?? 0);
        return [
          key,
          supported.filter((flag: Flag) => can(access, key, flag, scope)),
        ];
      }),
    ) as GetConstructionContractsAccessResponseModel["menus"];
    const body: GetConstructionContractsAccessResponseModel = {
      projectId: model.projectId,
      role: project.role,
      structure: project.structure,
      menus,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
