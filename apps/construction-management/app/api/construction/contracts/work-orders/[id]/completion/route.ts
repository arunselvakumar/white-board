import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  advanceHandlers,
  expected,
  respond,
} from "../../../advances/advance-access";
import { RecordConstructionContractsWorkOrderCompletionRequestModel } from "../../../advances/advance-models";
import { requireWorkOrderAccess } from "../../work-order-access";
import { ConstructionContractsWorkOrderParamsModel } from "../../work-order-models";

export const dynamic = "force-dynamic";

/**
 * Records the Work Order's completion date, where its DLP starts (CM-1108;
 * Work Order Update, an issued or closed Work Order). Answers its advances
 * and retention with the DLP worked out again.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionContractsWorkOrderParamsModel.safeParse(await context.params),
    );
    const session = await requireWorkOrderAccess(request, "update", id);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      RecordConstructionContractsWorkOrderCompletionRequestModel.safeParse(
        await request.json(),
      ),
    );
    return respond(
      await advanceHandlers.setCompletion(
        session.access,
        id,
        expected(model.expectedUpdatedAt),
        model.completedOn,
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
