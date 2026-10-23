import { parseOrThrow } from "@/app/api/_lib/map-error";

import {
  escalationBillHandlers,
  escalationBillRoute,
  expected,
} from "../../escalation-bill-access";
import { ConstructionContractsEscalationBillStepRequestModel } from "../../escalation-bill-models";

export const dynamic = "force-dynamic";

/** Approves a pending escalation bill (CM-1109): the finance invoice (origin ra_bill) for a positive net; none for a negative bill, which running bills then recover. 409 BILL_NOT_PENDING, ESCALATION_WORKING_CHANGED, ESCALATION_PERIOD_OVERLAP. */
export const POST = escalationBillRoute(
  "approve",
  async (session, id, request) => {
    const model = parseOrThrow(
      ConstructionContractsEscalationBillStepRequestModel.safeParse(
        await request.json(),
      ),
    );
    return escalationBillHandlers.approve(
      session.access,
      id,
      expected(model.expectedUpdatedAt),
    );
  },
);
