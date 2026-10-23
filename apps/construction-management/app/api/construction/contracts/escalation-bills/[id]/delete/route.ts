import { parseOrThrow } from "@/app/api/_lib/map-error";

import {
  escalationBillHandlers,
  escalationBillRoute,
  expected,
} from "../../escalation-bill-access";
import { ConstructionContractsEscalationBillStepRequestModel } from "../../escalation-bill-models";

export const dynamic = "force-dynamic";

/** Deletes a draft (CM-1109). Its creator with Create, or Delete. */
export const POST = escalationBillRoute(
  ["delete", "create"],
  async (session, id, request) => {
    const model = parseOrThrow(
      ConstructionContractsEscalationBillStepRequestModel.safeParse(
        await request.json(),
      ),
    );
    return escalationBillHandlers.delete(
      session.access,
      id,
      expected(model.expectedUpdatedAt),
    );
  },
);
