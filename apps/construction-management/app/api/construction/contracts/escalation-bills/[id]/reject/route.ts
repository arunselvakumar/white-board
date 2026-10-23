import { parseOrThrow } from "@/app/api/_lib/map-error";

import {
  escalationBillHandlers,
  escalationBillRoute,
  expected,
} from "../../escalation-bill-access";
import { RejectConstructionContractsEscalationBillRequestModel } from "../../escalation-bill-models";

export const dynamic = "force-dynamic";

/** Rejects a pending escalation bill with a reason (CM-1109). */
export const POST = escalationBillRoute(
  "reject",
  async (session, id, request) => {
    const model = parseOrThrow(
      RejectConstructionContractsEscalationBillRequestModel.safeParse(
        await request.json(),
      ),
    );
    return escalationBillHandlers.reject(
      session.access,
      id,
      model.reason,
      expected(model.expectedUpdatedAt),
    );
  },
);
