import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";

import { seedProjectSales } from "@/src/sales/infrastructure/seed-project-sales";

import { addProject } from "./companies";

/**
 * Sales test helpers (M10). Projects and Wings are written straight to
 * `construction_projects` for tests that only need them to exist.
 * Append-only: each M10 ticket adds its helpers below its own heading.
 */

// ---------------------------------------------------------------------------
// CM-1001 foundation
// ---------------------------------------------------------------------------

/**
 * A live Project with its seeded sales lists (CM-0022 §2), as a Project made
 * through the route has them (`addProject` alone runs no listeners).
 */
export async function salesProject(
  workspaceId: string,
  by: string,
  name?: string,
): Promise<string> {
  const projectId = await addProject(workspaceId, by, name);
  await seedProjectSales(prisma, { workspaceId, projectId, by });
  return projectId;
}

export type SalesTestWing = {
  wingId: string;
  /** Floor ids from the ground floor up. */
  floorIds: string[];
  /** Unit ids by name, e.g. `G01`, `101`, `102`. */
  units: Record<string, string>;
};

/**
 * A live Wing on the Project with `floors` floors above the ground floor
 * and `perFloor` units on each (names `G01…`, `101…`), in a new phase.
 */
export async function salesWing(
  workspaceId: string,
  projectId: string,
  by: string,
  options: { name?: string; floors?: number; perFloor?: number } = {},
): Promise<SalesTestWing> {
  const now = new Date();
  const stamp = {
    createdAt: now,
    updatedAt: now,
    createdBy: by,
    updatedBy: by,
  };
  const phaseId = randomUUID();
  await prisma.constructionProjectsPhase.create({
    data: {
      id: phaseId,
      workspaceId,
      projectId,
      name: "Phase 1",
      position: 0,
      ...stamp,
    },
  });
  const wingId = randomUUID();
  await prisma.constructionProjectsWing.create({
    data: {
      id: wingId,
      workspaceId,
      projectId,
      phaseId,
      wingType: "residential",
      name: options.name ?? `Wing ${randomUUID().slice(0, 4)}`,
      config: {},
      position: 0,
      ...stamp,
    },
  });
  const floorIds: string[] = [];
  const units: Record<string, string> = {};
  for (let level = 0; level <= (options.floors ?? 1); level += 1) {
    const floorId = randomUUID();
    floorIds.push(floorId);
    await prisma.constructionProjectsFloor.create({
      data: {
        id: floorId,
        workspaceId,
        wingId,
        kind: level === 0 ? "ground" : "typed",
        name: level === 0 ? "Ground" : `Floor ${String(level)}`,
        level,
      },
    });
    for (let position = 1; position <= (options.perFloor ?? 2); position += 1) {
      const name = `${level === 0 ? "G" : String(level)}${String(position).padStart(2, "0")}`;
      const id = randomUUID();
      units[name] = id;
      await prisma.constructionProjectsUnit.create({
        data: { id, workspaceId, wingId, floorId, name, position },
      });
    }
  }
  return { wingId, floorIds, units };
}

// ---------------------------------------------------------------------------
// CM-1005 / CM-1006 Units and Bookings
// ---------------------------------------------------------------------------

/**
 * A booking written straight to `construction_sales.bookings` with its
 * first history row, for tests that need a unit held or booked (the
 * route checks nothing here: one active booking per unit still holds).
 */
export async function salesBookingRow(
  workspaceId: string,
  projectId: string,
  wingId: string,
  unitId: string,
  by: string,
  options: {
    status?: "on_hold" | "booked" | "cancelled";
    bookingDate?: string;
    holdUntil?: string | null;
    customerName?: string;
    inquiryId?: string | null;
  } = {},
): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  const status = options.status ?? "booked";
  const bookingDate = new Date(
    `${options.bookingDate ?? now.toISOString().slice(0, 10)}T00:00:00.000Z`,
  );
  const holdUntil =
    options.holdUntil == null
      ? null
      : new Date(`${options.holdUntil}T00:00:00.000Z`);
  await prisma.constructionSalesBooking.create({
    data: {
      id,
      workspaceId,
      projectId,
      wingId,
      unitId,
      status,
      bookingDate,
      holdUntil,
      customerName: options.customerName ?? "Meena Raghavan",
      inquiryId: options.inquiryId ?? null,
      confirmedOn: status === "booked" ? bookingDate : null,
      createdAt: now,
      updatedAt: now,
      createdBy: by,
      updatedBy: by,
    },
  });
  await prisma.constructionSalesBookingEvent.create({
    data: {
      id: randomUUID(),
      workspaceId,
      bookingId: id,
      status,
      onDate: bookingDate,
      holdUntil,
      occurredAt: now,
      actorUserId: by,
    },
  });
  return id;
}
