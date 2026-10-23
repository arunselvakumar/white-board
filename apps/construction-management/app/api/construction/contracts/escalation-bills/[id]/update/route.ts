import { parseOrThrow } from "@/app/api/_lib/map-error";

import {
  escalationBillHandlers,
  escalationBillRoute,
  expected,
} from "../../escalation-bill-access";
import { UpdateConstructionContractsEscalationBillRequestModel } from "../../escalation-bill-models";

export const dynamic = "force-dynamic";

/**
 * Saves a draft and works it out again (CM-1109): bill date, period,
 * remarks, 10CA quantities and (with Financial) deductions. Its creator
 * with Create, or Update. 409 BILL_CHANGED, BILL_STATUS_INVALID,
 * ESCALATION_PERIOD_OVERLAP.
 */
export const POST = escalationBillRoute(
  ["update", "create"],
  async (session, id, request) => {
    const { expectedUpdatedAt, ...input } = parseOrThrow(
      UpdateConstructionContractsEscalationBillRequestModel.safeParse(
        await request.json(),
      ),
    );
    return escalationBillHandlers.update(
      session.access,
      id,
      expected(expectedUpdatedAt),
      input,
    );
  },
);
