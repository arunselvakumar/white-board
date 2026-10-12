import type { PrismaClient } from "@repo/construction-db";

import {
  assertCanCreate,
  assertCanEdit,
  assertPeriodOpen,
  type BackdatedModuleKey,
} from "@/src/shared-kernel/backdated-policy";
import {
  loadBackdatedActor,
  loadBackdatedPolicy,
} from "@/src/shared-kernel/backdated-policy-reader";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { companyToday } from "@/src/shared-kernel/company-today";

import type { ClosingCheck } from "../application/account-handlers";

/** Checks one entry date against the Back-dated Entry policy (CM-113). */
export type FinanceBackdatedCheck = (
  module: BackdatedModuleKey,
  action: "create" | "edit",
  date: CalendarDate,
) => void;

/**
 * Loads the policy, the actor's designation and the Company's today once,
 * then checks any number of finance dates. Throws the kernel's 403
 * `FINANCIAL_PERIOD_CLOSED` / `BACKDATED_*_BLOCKED`.
 */
export async function loadFinanceBackdatedCheck(
  db: PrismaClient,
  actor: { workspaceId: string; userId: string; role: "owner" | "member" },
): Promise<FinanceBackdatedCheck> {
  const [policy, backdatedActor, today] = await Promise.all([
    loadBackdatedPolicy(db, actor.workspaceId),
    loadBackdatedActor(db, actor),
    companyToday(db, actor.workspaceId),
  ]);
  return (module, action, date) => {
    if (action === "create")
      assertCanCreate(policy, module, date, backdatedActor, today);
    else assertCanEdit(policy, module, date, backdatedActor, today);
  };
}

/**
 * The Financial Closing Date alone (ADR CM-0017 §15): approving,
 * rejecting, deleting or re-dating money on or before it is refused with
 * 403 `FINANCIAL_PERIOD_CLOSED`. The back-dated day limits do not apply to
 * decisions.
 */
export async function loadClosingCheck(
  db: PrismaClient,
  workspaceId: string,
): Promise<ClosingCheck> {
  const policy = await loadBackdatedPolicy(db, workspaceId);
  const closing = policy.financialClosingDate;
  return (date, action) => {
    assertPeriodOpen(closing, date, { cannot: action });
  };
}
