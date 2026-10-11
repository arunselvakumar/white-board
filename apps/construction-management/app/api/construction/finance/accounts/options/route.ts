import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { financeDirectory } from "@/src/composition/finance-directory";
import { accountOptions } from "@/src/finance/infrastructure/account-options";
import { can } from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";

import {
  GetConstructionFinanceAccountOptionsRequestModel,
  type GetConstructionFinanceAccountOptionsResponseModel,
} from "../account-models";

export const dynamic = "force-dynamic";

/**
 * The account picker's options (ADR CM-0017 §2). Any member of the Company
 * may list them: the form that uses one checks its own menu, and the
 * command checks the account again.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      GetConstructionFinanceAccountOptionsRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const access = await loadMemberAccess(prisma, session);
    const items = await accountOptions(
      prisma,
      financeDirectory,
      session.workspaceId,
      {
        userId: session.userId,
        anyPettyCash: can(access, "finance.petty_cash", "view_all"),
      },
    );
    const body: GetConstructionFinanceAccountOptionsResponseModel = {
      items: items.filter((item) =>
        model.mode == null
          ? true
          : model.mode === "cash"
            ? item.kind !== "bank"
            : item.kind === "bank",
      ),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
