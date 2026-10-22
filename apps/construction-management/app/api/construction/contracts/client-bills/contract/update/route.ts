import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  clientBillHandlers,
  requestProjectId,
  requireClientBillProjectAccess,
} from "../../client-bill-access";
import {
  toClientContractResponse,
  UpdateConstructionContractsClientContractRequestModel,
} from "../../client-bill-models";

export const dynamic = "force-dynamic";

/**
 * Saves the Project's client contract terms (CM-1107). Bills drafted or
 * refreshed afterwards use them; a pending bill keeps its own. 400 on a
 * bad percentage, SAC, GST rate, DLP or date (`terms.*`), 409
 * CLIENT_CONTRACT_CHANGED when stale. Needs Client Bill update.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const projectId = requestProjectId(body);
    const session = await requireClientBillProjectAccess(
      request,
      "update",
      projectId,
    );
    if (isResponse(session)) return session;
    const {
      expectedUpdatedAt,
      projectId: _projectId,
      ...terms
    } = parseOrThrow(
      UpdateConstructionContractsClientContractRequestModel.safeParse(body),
    );
    const view = await clientBillHandlers.saveContract(
      session.access,
      projectId,
      expectedUpdatedAt == null ? null : new Date(expectedUpdatedAt),
      terms,
    );
    return Response.json(toClientContractResponse(projectId, view));
  } catch (error) {
    return mapError(error);
  }
}
