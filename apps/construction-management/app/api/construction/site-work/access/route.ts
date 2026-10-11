import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { can, menuByKey, type Flag } from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";
import { fromMask } from "@/src/shared-kernel/access/flags";

import {
  GetConstructionSiteWorkAccessRequestModel,
  SITE_WORK_ACCESS_MENUS,
  type GetConstructionSiteWorkAccessResponseModel,
} from "./access-models";

export const dynamic = "force-dynamic";

/**
 * What the caller may do in site work (M6), for screens to hide actions:
 * every supported flag of each site-work menu that `can` grants, on the
 * Project when `projectId` is given.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      GetConstructionSiteWorkAccessRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const access = await loadMemberAccess(prisma, session);
    const scope = model.projectId == null ? {} : { projectId: model.projectId };
    const menus = Object.fromEntries(
      SITE_WORK_ACCESS_MENUS.map((key) => {
        const supported = fromMask(menuByKey(key)?.supported ?? 0);
        return [
          key,
          supported.filter((flag: Flag) => can(access, key, flag, scope)),
        ];
      }),
    ) as GetConstructionSiteWorkAccessResponseModel["menus"];
    const body: GetConstructionSiteWorkAccessResponseModel = {
      projectId: model.projectId ?? null,
      menus,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
