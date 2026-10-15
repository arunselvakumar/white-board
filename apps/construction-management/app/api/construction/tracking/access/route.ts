import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { trackingDirectory } from "@/src/composition/tracking-directory";
import { can, menuByKey, type Flag } from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";
import { fromMask } from "@/src/shared-kernel/access/flags";
import { trackingProjectNotFound } from "@/src/tracking/domain/tracking-errors";

import {
  GetConstructionTrackingAccessRequestModel,
  TRACKING_ACCESS_MENUS,
  type GetConstructionTrackingAccessResponseModel,
} from "./access-models";

export const dynamic = "force-dynamic";

/**
 * What the caller may do in tracking on a Project (M8), for screens to
 * hide actions: every supported flag of each tracking menu that `can`
 * grants on the Project. 404 `PROJECT_NOT_FOUND` for a Project that is not
 * a live Project of the Company.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      GetConstructionTrackingAccessRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const project = await trackingDirectory.project(
      prisma,
      session.workspaceId,
      model.projectId,
    );
    if (project == null) throw trackingProjectNotFound();
    const access = await loadMemberAccess(prisma, session);
    const scope = { projectId: model.projectId };
    const menus = Object.fromEntries(
      TRACKING_ACCESS_MENUS.map((key) => {
        const supported = fromMask(menuByKey(key)?.supported ?? 0);
        return [
          key,
          supported.filter((flag: Flag) => can(access, key, flag, scope)),
        ];
      }),
    ) as GetConstructionTrackingAccessResponseModel["menus"];
    const body: GetConstructionTrackingAccessResponseModel = {
      projectId: model.projectId,
      menus,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
