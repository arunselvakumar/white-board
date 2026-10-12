import { prisma } from "@repo/construction-db";

import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { financeDirectory } from "@/src/composition/finance-directory";
import { CentralPayment } from "@/src/finance/infrastructure/central-payment";
import { PettyCashAccounts } from "@/src/finance/infrastructure/petty-cash-accounts";
import { can } from "@/src/shared-kernel/access";
import { companyToday } from "@/src/shared-kernel/company-today";

import type { GetConstructionFinanceCentralPaymentResponseModel } from "./central-payment-models";

export const dynamic = "force-dynamic";

const central = new CentralPayment(prisma, financeDirectory);
const pettyCash = new PettyCashAccounts(financeDirectory, prisma);

function paise(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error("A payment figure is beyond a safe integer.");
  return number;
}

/**
 * Central Payment (CM-709, ADR CM-0017 §14, §16), behind Central payment
 * (`finance.central_payment`) Read: party dues across every Project for
 * the Owner (Store suppliers included), across the Projects a member is
 * on otherwise; company accounts with Company's Bank A/C Read; petty-cash
 * accounts with Petty Cash Read (their own only without View all).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "finance.central_payment",
      "read",
    );
    if (isResponse(session)) return session;
    const { access, workspaceId } = session;
    const today = await companyToday(prisma, workspaceId);
    const projectIds = session.role === "owner" ? null : [...access.projectIds];
    const [parties, accounts, petty, projectCount] = await Promise.all([
      central.partyDues(workspaceId, { projectIds }, today),
      can(access, "masters.bank_accounts", "read")
        ? central.companyAccounts(workspaceId, today)
        : null,
      can(access, "finance.petty_cash", "read") ? pettyCash.list(access) : null,
      projectIds == null
        ? prisma.constructionProjectsProject.count({
            where: { workspaceId, deletedAt: null },
          })
        : Promise.resolve(projectIds.length),
    ]);
    const ofType = (type: "contractor" | "supplier" | "other_party") =>
      parties
        .filter((party) => party.partyType === type)
        .map((party) => ({
          partyId: party.partyId,
          name: party.name,
          projectCount: party.projectCount,
          invoiced: paise(party.invoiced),
          paid: paise(party.paid),
          due: paise(party.due),
          overdue: paise(party.overdue),
          advance: paise(party.advance),
          receivable: paise(party.receivable),
          balance: paise(party.balance),
        }));
    const body: GetConstructionFinanceCentralPaymentResponseModel = {
      asOn: today,
      allProjects: projectIds == null,
      projectCount,
      parties: {
        contractor: ofType("contractor"),
        supplier: ofType("supplier"),
        other_party: ofType("other_party"),
      },
      accounts:
        accounts?.map((account) => ({
          ...account,
          balance: paise(account.balance),
          pendingTotal: paise(account.pendingTotal),
        })) ?? null,
      pettyCash:
        petty?.map((account) => ({
          id: account.id,
          name: account.name,
          holderName: account.holderName,
          isOwn: account.isOwn,
          balance: paise(account.balance),
          pendingTotal: paise(account.pendingTotal),
          pendingCount: account.pendingCount,
          lastVoucherDate: account.lastVoucherDate,
        })) ?? null,
      reports: {
        ledger: {
          company: can(access, "masters.bank_accounts", "report"),
          pettyCash: can(access, "finance.petty_cash", "report"),
        },
        tds194c: can(access, "finance.parties", "report"),
        duePayments: can(access, "finance.parties", "report"),
      },
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
