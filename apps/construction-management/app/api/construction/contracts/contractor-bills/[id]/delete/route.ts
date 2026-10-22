import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  contractorBillHandlers,
  requireContractorBillAccess,
} from "../../contractor-bill-access";
import {
  ConstructionContractsContractorBillParamsModel,
  ConstructionContractsContractorBillStepRequestModel,
} from "../../contractor-bill-models";
import { expected } from "../../contractor-bill-route";

export const dynamic = "force-dynamic";

/**
 * Deletes a draft Contractor Bill (CM-1106; a tombstone) and frees its
 * rows. 409 BILL_STATUS_INVALID once submitted. Needs Contractor Bill
 * delete, or create for its creator.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionContractsContractorBillParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireContractorBillAccess(
      request,
      ["create", "delete"],
      id,
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ConstructionContractsContractorBillStepRequestModel.safeParse(
        await request.json(),
      ),
    );
    await contractorBillHandlers.delete(
      session.access,
      id,
      expected(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
