import { parseOrThrow } from "@/app/api/_lib/map-error";

import {
  escalationBillHandlers,
  escalationBillRoute,
  expected,
} from "../../escalation-bill-access";
import { ConstructionContractsEscalationBillStepRequestModel } from "../../escalation-bill-models";

export const dynamic = "force-dynamic";

/** Sends a draft for approval (CM-1109): numbered from the side's bill sequence. 409 ESCALATION_WORKING_CHANGED, ESCALATION_GROSS_ZERO, ESCALATION_PERIOD_OVERLAP. */
export const POST = escalationBillRoute(
  ["update", "create"],
  async (session, id, request) => {
    const model = parseOrThrow(
      ConstructionContractsEscalationBillStepRequestModel.safeParse(
        await request.json(),
      ),
    );
    return escalationBillHandlers.submit(
      session.access,
      id,
      expected(model.expectedUpdatedAt),
    );
  },
);
