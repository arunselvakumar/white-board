import { parseOrThrow } from "@/app/api/_lib/map-error";

import {
  escalationBillHandlers,
  escalationBillRoute,
  expected,
} from "../../escalation-bill-access";
import { ReverseConstructionContractsEscalationBillRequestModel } from "../../escalation-bill-models";

export const dynamic = "force-dynamic";

/** Reverses an approved escalation bill (CM-1109): only the latest approved one on its contract (409 BILL_NOT_LATEST), nothing settled (409 BILL_SETTLED), no running bill recovering it (409 ESCALATION_RECOVERED). Needs Approve. */
export const POST = escalationBillRoute(
  "approve",
  async (session, id, request) => {
    const model = parseOrThrow(
      ReverseConstructionContractsEscalationBillRequestModel.safeParse(
        await request.json(),
      ),
    );
    return escalationBillHandlers.reverse(
      session.access,
      id,
      model.reason,
      expected(model.expectedUpdatedAt),
    );
  },
);
