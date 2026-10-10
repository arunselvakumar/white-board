import type { PrismaClient } from "@repo/construction-db";

import {
  assertCanCreate,
  assertCanEdit,
  type BackdatedModuleKey,
} from "@/src/shared-kernel/backdated-policy";
import {
  loadBackdatedActor,
  loadBackdatedPolicy,
} from "@/src/shared-kernel/backdated-policy-reader";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { companyToday } from "@/src/shared-kernel/company-today";

export type ProcurementActor = {
  workspaceId: string;
  userId: string;
  role: "owner" | "member";
};

/** Checks one entry date against the Back-dated Entry policy (CM-113). */
export type BackdatedCheck = (
  module: BackdatedModuleKey,
  action: "create" | "edit",
  date: CalendarDate,
) => void;

/**
 * Loads the policy, the actor's designation and the Company's today once,
 * then checks any number of procurement dates (ADR CM-0015 §13). Throws
 * the kernel's 403 `FINANCIAL_PERIOD_CLOSED` / `BACKDATED_*_BLOCKED`.
 */
export async function loadBackdatedCheck(
  db: PrismaClient,
  actor: ProcurementActor,
): Promise<BackdatedCheck> {
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
