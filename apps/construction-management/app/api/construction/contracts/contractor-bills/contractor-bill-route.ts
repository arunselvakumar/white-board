import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import type { AccessSession } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import type { StoredBill } from "@/src/contracts/application/contractor-bill-ports";
import type { Flag } from "@/src/shared-kernel/access";

import {
  contractorBillHandlers,
  requireContractorBillAccess,
} from "./contractor-bill-access";
import {
  ConstructionContractsContractorBillParamsModel,
  toContractorBillResponse,
} from "./contractor-bill-models";

type Context = { params: Promise<{ id: string }> };

/**
 * A route about one Contractor Bill: loads it (404 BILL_NOT_FOUND for
 * another Company's or a deleted one), checks `flags` on its Project (any
 * one), runs `act` and answers with the bill as it now is.
 */
export function contractorBillRoute(
  flags: Flag | readonly [Flag, ...Flag[]],
  act: (
    session: AccessSession & { target: StoredBill },
    id: string,
    request: Request,
  ) => Promise<unknown>,
) {
  return async (request: Request, context: Context): Promise<Response> => {
    try {
      const { id } = parseOrThrow(
        ConstructionContractsContractorBillParamsModel.safeParse(
          await context.params,
        ),
      );
      const session = await requireContractorBillAccess(request, flags, id);
      if (isResponse(session)) return session;
      await act(session, id, request);
      const detail = await contractorBillHandlers.get(session.access, id);
      return Response.json(toContractorBillResponse(detail));
    } catch (error) {
      return mapError(error);
    }
  };
}

/** `expectedUpdatedAt` as a Date, or null when not sent. */
export function expected(raw: string | null | undefined): Date | null {
  return raw == null ? null : new Date(raw);
}
