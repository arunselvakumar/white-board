import { prisma } from "@repo/db";

import { planExpired } from "@/src/shared-kernel/plan";

import { mapError } from "./map-error";

/**
 * Whether the Company's plan has ended: one indexed read of
 * `construction_organization.subscriptions`. A Company without a row has
 * no plan yet, so it is neither limited nor ended.
 */
export async function planHasEnded(
  workspaceId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const row = await prisma.constructionOrganizationSubscription.findUnique({
    where: { workspaceId },
    select: { endsAt: true },
  });
  return row != null && row.endsAt.getTime() <= now.getTime();
}

/**
 * 402 `PLAN_EXPIRED` for a command on an ended plan (CM-118), or null.
 * `requireAccess` calls it for every write flag; an Owner-only command
 * route that uses `requireOwnerSession` calls it itself. Subscription,
 * checkout and webhook routes, sign-out, Company switching, reads and
 * export never call it.
 */
export async function requirePlanActive(session: {
  workspaceId: string;
}): Promise<Response | null> {
  return (await planHasEnded(session.workspaceId))
    ? mapError(planExpired())
    : null;
}
