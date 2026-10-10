import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { jsonError } from "@/app/api/_lib/json-error";
import { isResponse, requireCompanySession } from "@/app/api/_lib/require-session";
import { can } from "@/src/shared-kernel/access";
import { isUuid } from "@/src/shared-kernel/ids";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";
import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";

import { MATERIAL_PICKER_MENUS, materialHandlers } from "../material-routes";
import {
  ListConstructionMastersMaterialOptionsRequestModel,
  type ListConstructionMastersMaterialOptionsResponseModel,
} from "./material-option-models";

export const dynamic = "force-dynamic";


/**
 * The material picker of every procurement form (M5): live, enabled
 * Materials by name (`ids` also returns disabled ones a form already has).
 * Rate Details are null without Materials Financial.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const access = await loadMemberAccess(prisma, session);
    if (!MATERIAL_PICKER_MENUS.some((menu) => can(access, menu, "read")))
      return jsonError(
        StatusCodes.FORBIDDEN,
        "PERMISSION_DENIED",
        "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
      );
    const query = parseOrThrow(
      ListConstructionMastersMaterialOptionsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const ids = query.ids
      ?.split(",")
      .map((id) => id.trim())
      .filter(isUuid);
    const financial = can(access, "masters.materials", "financial");
    const items = await materialHandlers.options({
      workspaceId: session.workspaceId,
      search: query.search,
      categoryId: query.categoryId,
      ids,
      limit: query.limit,
    });
    const body: ListConstructionMastersMaterialOptionsResponseModel = {
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        specification: item.specification,
        uomId: item.uomId,
        uomName: item.uomName,
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        unitRate: financial ? item.unitRate : null,
        discount: financial ? item.discount : null,
        gstRate: financial ? item.gstRate : null,
        hsnCode: financial ? item.hsnCode : null,
        minStockQty: item.minStockQty,
      })),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
