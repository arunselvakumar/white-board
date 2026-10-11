import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { finance, PARTIES_MENU } from "../parties/handlers";
import {
  ListConstructionFinanceWorkspacePartyBalancesRequestModel,
  toWorkspacePartyBalancesResponse,
} from "./party-balance-workspace-models";

export const dynamic = "force-dynamic";

/**
 * Workspace → Party Balance (CM-708, CM-0017 §11): each Other Party's
 * balance across Projects with the split by Project. The Owner sees every
 * Project; a member the Projects they read Parties on.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, PARTIES_MENU, "read");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionFinanceWorkspacePartyBalancesRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const balances = await finance.queries.workspaceBalances(
      session.access,
      model.partyType ?? "other_party",
    );
    return Response.json(toWorkspacePartyBalancesResponse(balances));
  } catch (error) {
    return mapError(error);
  }
}
