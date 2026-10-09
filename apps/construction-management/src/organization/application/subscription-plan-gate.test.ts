import { describe, expect, it } from "vitest";

import type { PlanGrant } from "@/src/shared-kernel/plan";

import { planCatalogue } from "../infrastructure/plan-catalogue";
import { Subscription, DAY_MS } from "../domain/subscription";
import { SubscriptionPlanGate } from "./subscription-plan-gate";

const NOW = new Date("2026-10-08T06:30:00.000Z");

function gate(
  subscription: Subscription | null,
  used: Partial<Record<PlanGrant, number>>,
) {
  return new SubscriptionPlanGate(
    { find: () => Promise.resolve(subscription) },
    {
      count: (_workspaceId, grant) => Promise.resolve(used[grant] ?? 0),
      snapshot: () => Promise.reject(new Error("unused")),
    },
    planCatalogue,
    () => NOW,
  );
}

const basic = (endsAt: Date, addOns = {}) =>
  new Subscription("s", "w", "basic", NOW, endsAt, false, addOns, 1_400_000);

describe("SubscriptionPlanGate (CM-118)", () => {
  it("allows up to the plan's limit plus add-ons", async () => {
    const running = basic(new Date(NOW.getTime() + DAY_MS));
    await expect(
      gate(running, { team_member: 4 }).assertCanAdd("w", "team_member"),
    ).resolves.toBeUndefined();
    await expect(
      gate(running, { team_member: 5 }).assertCanAdd("w", "team_member"),
    ).rejects.toMatchObject({
      code: "PLAN_LIMIT_EXCEEDED",
      kind: "limit",
      details: { grant: "team_member", limit: 5, used: 5 },
    });
    await expect(
      gate(basic(new Date(NOW.getTime() + DAY_MS), { team_member: 1 }), {
        team_member: 5,
      }).assertCanAdd("w", "team_member"),
    ).resolves.toBeUndefined();
  });

  it("counts HRMS seats separately from Team Members", async () => {
    const running = basic(new Date(NOW.getTime() + DAY_MS));
    await expect(
      gate(running, { team_member: 5, hrms_member: 9 }).assertCanAdd(
        "w",
        "hrms_member",
      ),
    ).resolves.toBeUndefined();
    await expect(
      gate(running, { hrms_member: 10 }).assertCanAdd("w", "hrms_member"),
    ).rejects.toMatchObject({
      details: { grant: "hrms_member", limit: 10, used: 10 },
    });
  });

  it("refuses everything once the plan has ended", async () => {
    await expect(
      gate(basic(NOW), {}).assertCanAdd("w", "project"),
    ).rejects.toMatchObject({ code: "PLAN_EXPIRED", kind: "limit" });
  });

  it("neither limits nor expires a Company with no plan yet", async () => {
    await expect(
      gate(null, { team_member: 99 }).assertCanAdd("w", "team_member"),
    ).resolves.toBeUndefined();
    await expect(
      gate(null, { project: 99 }).assertCanAdd("w", "project", 5),
    ).resolves.toBeUndefined();
  });
});
