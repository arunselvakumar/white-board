import type { PrismaClient } from "@repo/construction-db";

import {
  assertCanCreate,
  assertCanEdit,
  assertPeriodOpen,
} from "@/src/shared-kernel/backdated-policy";
import {
  loadBackdatedActor,
  loadBackdatedPolicy,
} from "@/src/shared-kernel/backdated-policy-reader";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { companyToday } from "@/src/shared-kernel/company-today";

export type PettyCashActor = {
  workspaceId: string;
  userId: string;
  role: "owner" | "member";
};

/**
 * The date rules of a petty-cash command (CM-113, CM-0017 §15), loaded
 * once per request:
 * - `create` / `edit`: the Back-dated Entry limits of module `petty_cash`
 *   and the Financial Closing Date (403 `BACKDATED_*_BLOCKED`,
 *   `FINANCIAL_PERIOD_CLOSED`);
 * - `decide`: the Financial Closing Date alone, for approve and reject,
 *   which post or keep money off the books ("cannot be approved").
 */
export type PettyCashDates = {
  today: CalendarDate;
  create(date: CalendarDate): void;
  edit(date: CalendarDate): void;
  decide(date: CalendarDate, verb: "approved" | "rejected"): void;
};

export async function loadPettyCashDates(
  db: PrismaClient,
  actor: PettyCashActor,
): Promise<PettyCashDates> {
  const [policy, who, today] = await Promise.all([
    loadBackdatedPolicy(db, actor.workspaceId),
    loadBackdatedActor(db, actor),
    companyToday(db, actor.workspaceId),
  ]);
  return {
    today,
    create: (date) => {
      assertCanCreate(policy, "petty_cash", date, who, today);
    },
    edit: (date) => {
      assertCanEdit(policy, "petty_cash", date, who, today);
    },
    decide: (date, verb) => {
      assertPeriodOpen(policy.financialClosingDate, date, {
        cannot: verb,
        what: "Vouchers",
        module: "petty_cash",
      });
    },
  };
}

/** The Financial Closing Date alone, for an opening balance's date. */
export async function assertPettyCashPeriodOpen(
  db: PrismaClient,
  workspaceId: string,
  date: CalendarDate,
): Promise<void> {
  const policy = await loadBackdatedPolicy(db, workspaceId);
  assertPeriodOpen(policy.financialClosingDate, date, {
    cannot: "entered",
    what: "An opening balance",
    module: "petty_cash",
  });
}
