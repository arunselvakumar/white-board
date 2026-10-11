import type { PrismaClient } from "@repo/construction-db";

import {
  assertCanCreate,
  assertCanEdit,
} from "@/src/shared-kernel/backdated-policy";
import {
  loadBackdatedActor,
  loadBackdatedPolicy,
} from "@/src/shared-kernel/backdated-policy-reader";
import {
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { companyToday } from "@/src/shared-kernel/company-today";
import { DomainError } from "@/src/shared-kernel/domain-error";

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
      const closing = policy.financialClosingDate;
      if (closing != null && daysBetween(date, closing) >= 0)
        throw new DomainError(
          "FINANCIAL_PERIOD_CLOSED",
          `The books are closed up to ${closing}. Vouchers dated on or before it cannot be ${verb}.`,
          {
            kind: "forbidden",
            details: {
              module: "petty_cash",
              entryDate: date,
              financialClosingDate: closing,
            },
          },
        );
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
  const closing = policy.financialClosingDate;
  if (closing != null && daysBetween(date, closing) >= 0)
    throw new DomainError(
      "FINANCIAL_PERIOD_CLOSED",
      `The books are closed up to ${closing}. An opening balance dated on or before it cannot be entered.`,
      {
        kind: "forbidden",
        details: {
          module: "petty_cash",
          entryDate: date,
          financialClosingDate: closing,
        },
      },
    );
}
