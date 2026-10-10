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
  GetConstructionProcurementAccessRequestModel,
  PROCUREMENT_ACCESS_MENUS,
  type GetConstructionProcurementAccessResponseModel,
} from "./access-models";

export const dynamic = "force-dynamic";

/**
 * What the caller may do in procurement (M5), for screens to hide actions:
 * every supported flag of each procurement menu that `can` grants, on the
 * Project when `projectId` is given.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      GetConstructionProcurementAccessRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const access = await loadMemberAccess(prisma, session);
    const scope = model.projectId == null ? {} : { projectId: model.projectId };
    const menus = Object.fromEntries(
      PROCUREMENT_ACCESS_MENUS.map((key) => {
        const supported = fromMask(menuByKey(key)?.supported ?? 0);
        return [
          key,
          supported.filter((flag: Flag) => can(access, key, flag, scope)),
        ];
      }),
    ) as GetConstructionProcurementAccessResponseModel["menus"];
    const body: GetConstructionProcurementAccessResponseModel = {
      projectId: model.projectId ?? null,
      menus,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
