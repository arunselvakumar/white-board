import { prisma } from "@repo/construction-db";

import { parseOrThrow } from "@/app/api/_lib/map-error";
import type { AccessSession } from "@/app/api/_lib/require-access";
import { financeAuthorNames } from "@/src/composition/finance-author-names";
import { financeDirectory } from "@/src/composition/finance-directory";
import { messagingEvents } from "@/src/composition/messaging";
import {
  PETTY_CASH_MENU,
  voucherActions,
} from "@/src/finance/application/petty-cash-access";
import { PettyCashAccounts } from "@/src/finance/infrastructure/petty-cash-accounts";
import {
  loadPettyCashDates,
  type PettyCashDates,
} from "@/src/finance/infrastructure/petty-cash-guards";
import {
  PettyCashVouchers,
  type PettyCashVoucherView,
  type VoucherInput,
} from "@/src/finance/infrastructure/petty-cash-vouchers";

import {
  ConstructionFinancePettyCashAccountParamsModel,
  ConstructionFinancePettyCashVoucherParamsModel,
  toVoucherResponse,
  type CreateConstructionFinancePettyCashVoucherRequestModel,
} from "./petty-cash-models";

/** One composition for the Petty Cash routes (CM-703). */
export { PETTY_CASH_MENU };

export const pettyCashAccounts = new PettyCashAccounts(financeDirectory);

export const pettyCashVouchers = new PettyCashVouchers({
  directory: financeDirectory,
  names: financeAuthorNames(),
  events: messagingEvents(),
});

/** The caller's date rules (back-dated limits, closing date) for one request. */
export function datesFor(session: AccessSession): Promise<PettyCashDates> {
  return loadPettyCashDates(prisma, {
    workspaceId: session.workspaceId,
    userId: session.userId,
    role: session.access.role,
  });
}

export type IdContext = { params: Promise<{ id: string }> };

/** `{id}` of an account route; 400 for a bad id. */
export async function accountIdOf(context: IdContext): Promise<string> {
  return parseOrThrow(
    ConstructionFinancePettyCashAccountParamsModel.safeParse(
      await context.params,
    ),
  ).id;
}

/** `{id}` of a voucher route; 400 for a bad id. */
export async function voucherIdOf(context: IdContext): Promise<string> {
  return parseOrThrow(
    ConstructionFinancePettyCashVoucherParamsModel.safeParse(
      await context.params,
    ),
  ).id;
}

/** A request's voucher fields as the commands take them. */
export function voucherInputOf(
  body: Omit<
    CreateConstructionFinancePettyCashVoucherRequestModel,
    "accountId" | "approve"
  >,
): VoucherInput {
  return {
    voucherType: body.voucherType,
    voucherDate: body.voucherDate,
    projectId: body.projectId ?? null,
    counterparty: {
      kind: body.counterparty?.kind ?? null,
      id: body.counterparty?.id ?? null,
      name: body.counterparty?.name ?? null,
    },
    toAccountId: body.toAccountId ?? null,
    paymentCategoryId: body.paymentCategoryId ?? null,
    amount: BigInt(body.amount),
    paidFor: body.paidFor ?? null,
    reference: body.reference ?? null,
    description: body.description ?? null,
  };
}

export function voucherBody(
  session: AccessSession,
  view: PettyCashVoucherView,
) {
  return toVoucherResponse(view, voucherActions(session.access, view));
}
