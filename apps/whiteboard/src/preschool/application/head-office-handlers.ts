import { monthSpan, occupancyPercent } from "../domain/dashboard";
import { todayInIndia } from "../domain/dates";
import { invoiceDuePaise } from "../domain/fees";
import { assertRole, type PreschoolActor } from "./access";
import type { HeadOfficeStore } from "./head-office-ports";
import type { HeadOfficeCentreView, HeadOfficeView } from "./head-office-views";
import { centreRoyalty, monthOrCurrent } from "./royalty-handlers";
import type { RoyaltyStore } from "./royalty-ports";

/** The Head Office dashboard: every Centre side by side (Owner). */
export class HeadOfficeHandlers {
  constructor(
    private readonly deps: {
      store: HeadOfficeStore;
      royalty: RoyaltyStore;
      now: () => Date;
    },
  ) {}

  async overview(
    actor: PreschoolActor,
    query: { month?: string },
  ): Promise<HeadOfficeView> {
    assertRole(actor, ["owner"]);
    const now = this.deps.now();
    const today = todayInIndia(now);
    const month = monthOrCurrent(query.month, now);
    const span = monthSpan(month);
    const { royalty } = this.deps;
    const centres = await royalty.centres(actor.workspaceId);
    const ids = centres.map((centre) => centre.id);
    const [facts, heads, allocations] = await Promise.all([
      this.deps.store.facts(actor.workspaceId, ids, { today, ...span }),
      royalty.feeHeads(actor.workspaceId),
      royalty.allocations(actor.workspaceId, ids, span),
    ]);
    const factsById = new Map(facts.map((row) => [row.id, row]));
    const rows: HeadOfficeCentreView[] = centres.map((centre) => {
      const row = factsById.get(centre.id);
      let duePaise = 0;
      let overduePaise = 0;
      for (const invoice of row?.outstanding ?? []) {
        const due = invoiceDuePaise({ ...invoice, cancelled: false });
        duePaise += due;
        if (invoice.dueOn < today) overduePaise += due;
      }
      const activeChildren = row?.activeChildren ?? 0;
      const capacity = row?.capacity ?? 0;
      return {
        id: centre.id,
        name: centre.name,
        code: centre.code,
        ownership: centre.ownership,
        status: centre.status,
        activeChildren,
        capacity,
        occupancyPercent: occupancyPercent(activeChildren, capacity),
        presentToday: row?.presentToday ?? 0,
        collectedPaise: row?.collectedPaise ?? 0,
        duePaise,
        overduePaise,
        openEnquiries: row?.openEnquiries ?? 0,
        admissions: row?.admissions ?? 0,
        royaltyBps: centre.ownership === "franchised" ? centre.royaltyBps : 0,
        royaltyDuePaise: centreRoyalty(centre, heads, allocations).royaltyPaise,
      };
    });
    const total = (key: keyof HeadOfficeCentreView) =>
      rows.reduce((sum, row) => sum + Number(row[key]), 0);
    const activeChildren = total("activeChildren");
    const capacity = total("capacity");
    return {
      month,
      date: today,
      centres: rows,
      totals: {
        activeChildren,
        capacity,
        occupancyPercent: occupancyPercent(activeChildren, capacity),
        presentToday: total("presentToday"),
        collectedPaise: total("collectedPaise"),
        duePaise: total("duePaise"),
        overduePaise: total("overduePaise"),
        openEnquiries: total("openEnquiries"),
        admissions: total("admissions"),
        royaltyDuePaise: total("royaltyDuePaise"),
      },
    };
  }
}
