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
import { companyToday } from "@/src/shared-kernel/company-today";

import type { PartyBackdated } from "../application/party-ports";

/**
 * The Back-dated Entry policy (CM-113) for party documents, loaded once:
 * `check` applies a module's limits and the Financial Closing Date;
 * `closing` the closing date alone (CM-0017 §15).
 */
export async function loadPartyBackdated(
  db: PrismaClient,
  actor: { workspaceId: string; userId: string; role: "owner" | "member" },
): Promise<PartyBackdated> {
  const [policy, backdatedActor, today] = await Promise.all([
    loadBackdatedPolicy(db, actor.workspaceId),
    loadBackdatedActor(db, actor),
    companyToday(db, actor.workspaceId),
  ]);
  return {
    check(module, action, date) {
      if (action === "create")
        assertCanCreate(policy, module, date, backdatedActor, today);
      else assertCanEdit(policy, module, date, backdatedActor, today);
    },
    closing(date) {
      assertPeriodOpen(policy.financialClosingDate, date, {
        cannot: "changed",
      });
    },
  };
}
