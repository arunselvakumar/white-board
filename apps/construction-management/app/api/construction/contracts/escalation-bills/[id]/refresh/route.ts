import { parseOrThrow } from "@/app/api/_lib/map-error";

import {
  escalationBillHandlers,
  escalationBillRoute,
  expected,
} from "../../escalation-bill-access";
import { ConstructionContractsEscalationBillStepRequestModel } from "../../escalation-bill-models";

export const dynamic = "force-dynamic";

/** Works a draft out again with the bills approved and indices typed since (CM-1109). Its creator with Create, or Update. */
export const POST = escalationBillRoute(
  ["update", "create"],
  async (session, id, request) => {
    const model = parseOrThrow(
      ConstructionContractsEscalationBillStepRequestModel.safeParse(
        await request.json(),
      ),
    );
    return escalationBillHandlers.refresh(
      session.access,
      id,
      expected(model.expectedUpdatedAt),
    );
  },
);
