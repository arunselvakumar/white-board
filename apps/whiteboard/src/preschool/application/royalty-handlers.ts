import { royaltyBpsToPercent } from "../domain/centre";
import {
  assertMonth,
  monthOf,
  monthSpan,
  type Month,
} from "../domain/dashboard";
import { todayInIndia } from "../domain/dates";
import { conflict, notFound } from "../domain/errors";
import { royaltyPaise } from "../domain/fees";
import { assertRole, type PreschoolActor } from "./access";
import type {
  RoyaltyAllocation,
  RoyaltyCentre,
  RoyaltyFeeHead,
  RoyaltyStore,
} from "./royalty-ports";
import type {
  CentreRoyaltyStatementView,
  CentreRoyaltyView,
  RoyaltyPaymentView,
  RoyaltyStatementView,
} from "./royalty-views";

/**
 * A Centre's royalty for a month (ADR-0055): collections split by Fee Head,
 * royalty-bearing ones × the Centre's rate. Company-owned Centres owe 0.
 */
export function centreRoyalty(
  centre: RoyaltyCentre,
  heads: readonly RoyaltyFeeHead[],
  allocations: readonly RoyaltyAllocation[],
): CentreRoyaltyView {
  const byHead = new Map<string, number>();
  for (const allocation of allocations)
    if (allocation.centreId === centre.id)
      byHead.set(
        allocation.feeHeadId,
        (byHead.get(allocation.feeHeadId) ?? 0) + allocation.amountPaise,
      );
  const byFeeHead = heads
    .filter((head) => byHead.has(head.id))
    .map((head) => ({
      feeHeadId: head.id,
      name: head.name,
      royaltyBearing: head.royaltyBearing,
      collectedPaise: byHead.get(head.id) ?? 0,
    }));
  const royaltyBearingPaise = byFeeHead
    .filter((head) => head.royaltyBearing)
    .reduce((sum, head) => sum + head.collectedPaise, 0);
  const otherPaise = byFeeHead
    .filter((head) => !head.royaltyBearing)
    .reduce((sum, head) => sum + head.collectedPaise, 0);
  const bps = centre.ownership === "franchised" ? centre.royaltyBps : 0;
  return {
    centreId: centre.id,
    name: centre.name,
    code: centre.code,
    franchiseeName: centre.franchiseeName,
    royaltyBps: bps,
    royaltyPercent: royaltyBpsToPercent(bps),
    byFeeHead,
    royaltyBearingPaise,
    otherPaise,
    royaltyPaise: royaltyPaise(royaltyBearingPaise, bps),
  };
}

/** The month asked for, or this month in India. */
export function monthOrCurrent(month: string | undefined, now: Date): Month {
  return month == null ? monthOf(todayInIndia(now)) : assertMonth(month);
}

/** Royalty Statements: Head Office only. A report, never a bill. */
export class RoyaltyHandlers {
  constructor(
    private readonly deps: { store: RoyaltyStore; now: () => Date },
  ) {}

  async statement(
    actor: PreschoolActor,
    query: { month?: string },
  ): Promise<RoyaltyStatementView> {
    assertRole(actor, ["owner"]);
    const month = monthOrCurrent(query.month, this.deps.now());
    const span = monthSpan(month);
    const { store } = this.deps;
    const franchised = (await store.centres(actor.workspaceId)).filter(
      (centre) => centre.ownership === "franchised",
    );
    const [heads, allocations] = await Promise.all([
      store.feeHeads(actor.workspaceId),
      store.allocations(
        actor.workspaceId,
        franchised.map((centre) => centre.id),
        span,
      ),
    ]);
    const centres = franchised.map((centre) =>
      centreRoyalty(centre, heads, allocations),
    );
    return {
      month,
      ...span,
      centres,
      totals: {
        royaltyBearingPaise: sum(centres, "royaltyBearingPaise"),
        otherPaise: sum(centres, "otherPaise"),
        royaltyPaise: sum(centres, "royaltyPaise"),
      },
    };
  }

  async centre(
    actor: PreschoolActor,
    query: { centreId: string; month?: string },
  ): Promise<CentreRoyaltyStatementView> {
    assertRole(actor, ["owner"]);
    const month = monthOrCurrent(query.month, this.deps.now());
    const span = monthSpan(month);
    const { store } = this.deps;
    const [centre] = await store.centres(actor.workspaceId, query.centreId);
    if (centre == null)
      throw notFound("CENTRE_NOT_FOUND", "The Centre was not found.");
    if (centre.ownership !== "franchised")
      throw conflict(
        "CENTRE_NOT_FRANCHISED",
        `${centre.name} is Company-owned, so it pays no royalty.`,
      );
    const [heads, allocations] = await Promise.all([
      store.feeHeads(actor.workspaceId),
      store.allocations(actor.workspaceId, [centre.id], span),
    ]);
    const bearing = new Set(
      heads.filter((head) => head.royaltyBearing).map((head) => head.id),
    );
    const payments = new Map<string, RoyaltyPaymentView>();
    for (const allocation of allocations) {
      const row = payments.get(allocation.paymentId) ?? {
        paymentId: allocation.paymentId,
        receiptNumber: allocation.receiptNumber,
        receivedOn: allocation.receivedOn,
        childId: allocation.childId,
        childName: allocation.childName,
        royaltyBearingPaise: 0,
        otherPaise: 0,
      };
      if (bearing.has(allocation.feeHeadId))
        row.royaltyBearingPaise += allocation.amountPaise;
      else row.otherPaise += allocation.amountPaise;
      payments.set(allocation.paymentId, row);
    }
    return {
      ...centreRoyalty(centre, heads, allocations),
      month,
      ...span,
      payments: [...payments.values()].sort(
        (a, b) =>
          a.receivedOn.localeCompare(b.receivedOn) ||
          a.receiptNumber.localeCompare(b.receiptNumber),
      ),
    };
  }
}

function sum(
  rows: readonly CentreRoyaltyView[],
  key: "royaltyBearingPaise" | "otherPaise" | "royaltyPaise",
): number {
  return rows.reduce((total, row) => total + row[key], 0);
}
