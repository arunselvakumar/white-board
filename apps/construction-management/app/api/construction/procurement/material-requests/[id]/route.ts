import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { requireRequestAccess } from "../material-request-access";
import {
  ConstructionProcurementMaterialRequestParamsModel,
  toMaterialRequestResponse,
} from "../material-request-models";

export const dynamic = "force-dynamic";

/** One live Material Request (read; on its Project or Central store read). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionProcurementMaterialRequestParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireRequestAccess(request, id, "read", "any");
    if (isResponse(session)) return session;
    return Response.json(toMaterialRequestResponse(session.request));
  } catch (error) {
    return mapError(error);
  }
}
