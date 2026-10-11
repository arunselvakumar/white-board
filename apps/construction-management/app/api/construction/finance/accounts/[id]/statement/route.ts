import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import {
  canReadAccountStatement,
  statementPeriod,
} from "@/src/finance/application/account-access";
import { accountNotFound } from "@/src/finance/application/account-handlers";
import {
  accountStatement,
  statementAccount,
} from "@/src/finance/infrastructure/account-statement";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";
import { companyToday } from "@/src/shared-kernel/company-today";

import {
  ConstructionFinanceAccountParamsModel,
  GetConstructionFinanceAccountStatementRequestModel,
} from "../../account-models";
import { financeDirectory, toStatementResponse } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * An account's statement (the Ledger) for a period of at most 366 days,
 * this month by default. A company account needs Company's Bank A/C read
 * or Transactions read; a petty-cash account is its holder's, or needs
 * Petty Cash View all; the Owner sees every one.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinanceAccountParamsModel.safeParse(await context.params),
    );
    const query = parseOrThrow(
      GetConstructionFinanceAccountStatementRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const access = await loadMemberAccess(prisma, session);
    const account = await statementAccount(
      prisma,
      financeDirectory,
      session.workspaceId,
      id,
    );
    if (account == null) throw accountNotFound();
    if (!canReadAccountStatement(access, account))
      return jsonError(
        StatusCodes.FORBIDDEN,
        "PERMISSION_DENIED",
        "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
      );
    const period = statementPeriod(
      query,
      await companyToday(prisma, session.workspaceId),
    );
    const statement = await accountStatement(
      prisma,
      financeDirectory,
      session.workspaceId,
      {
        id: account.id,
        name: account.name,
        kind: account.kind,
        holderName: account.holderName,
      },
      {
        ...period,
        sourceType: query.sourceType,
        paymentCategoryId: query.paymentCategoryId,
        mode: query.mode,
        counterpartyKind: query.counterpartyKind,
      },
    );
    return Response.json(toStatementResponse(statement));
  } catch (error) {
    return mapError(error);
  }
}
