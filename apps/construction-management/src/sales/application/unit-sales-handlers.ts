import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import {
  bookingDisplayStatus,
  type BookingDisplayStatus,
} from "../domain/booking";
import {
  UNIT_SALES_STATUSES,
  type AreaUnit,
  type UnavailableReason,
  type UnitSalesStatus,
} from "../domain/sales-terms";
import {
  unavailableFields,
  unitHasBooking,
  unitNotFound,
  unitProfileChanged,
  unitProfileFields,
  unitSalesStatus,
  type UnitProfileFields,
  type UnitProfileInput,
} from "../domain/unit-profile";
import type {
  StoredBooking,
  StoredUnitProfile,
  UnitProfileRow,
} from "./booking-ports";
import type { SalesTx, SalesUnitFacts, SalesWingTree } from "./ports";
import {
  BOOKING_MENU,
  releaseExpiredHold,
  type SalesBookingDeps,
} from "./sales-booking-deps";

/**
 * Unit sales details and the Units chart (CM-1005, ADR CM-0022 §8). Every
 * write is one transaction holding the unit's lock, with its audit event;
 * Booking Update is needed for each. A unit is a Unit of the Project's
 * live Wings (`SalesDirectory`); its sales profile row is ours.
 */

export type UnitSalesCounts = Record<UnitSalesStatus, number> & {
  total: number;
};

export type BookingSummary = StoredBooking & {
  displayStatus: BookingDisplayStatus;
};

export type UnitChartUnit = {
  id: string;
  name: string;
  status: UnitSalesStatus;
  unitType: string | null;
  carpetArea: string | null;
  areaUnit: AreaUnit;
  /** The active booking (an expired hold included, shown Hold expired). */
  booking: {
    id: string;
    status: BookingDisplayStatus;
    customerName: string;
    holdUntil: CalendarDate | null;
  } | null;
};

export type UnitChartWing = {
  id: string;
  name: string;
  type: string;
  phaseName: string;
  counts: UnitSalesCounts;
};

export type UnitChart = {
  today: CalendarDate;
  /** Every live unit of the Project by sales status. */
  counts: UnitSalesCounts;
  wings: UnitChartWing[];
  /** The chosen Wing (the first without one) with its floors, top first. */
  wing:
    | (UnitChartWing & {
        floors: {
          id: string;
          name: string;
          kind: string;
          units: UnitChartUnit[];
        }[];
      })
    | null;
};

export type UnitProfileView = UnitProfileFields & {
  unavailable: boolean;
  unavailableReason: UnavailableReason | null;
  unavailableNote: string | null;
  /** Null until the unit has details: send it back as `expectedUpdatedAt`. */
  updatedAt: Date | null;
};

export type UnitSalesDetail = {
  id: string;
  name: string;
  projectId: string;
  wing: { id: string; name: string; type: string };
  floor: { id: string; name: string };
  status: UnitSalesStatus;
  profile: UnitProfileView;
  /** The active booking (On Hold, Hold expired or Booked). */
  booking: BookingSummary | null;
  /** Every live booking of the unit, newest first (cancelled ones included). */
  bookings: BookingSummary[];
};

export type UnitActions = {
  /** Unit type and areas: Update. */
  editDetails: boolean;
  /** Update, while it has no live booking (an expired hold is cancelled). */
  markUnavailable: boolean;
  /** Update, while unavailable. */
  markAvailable: boolean;
  /** Hold or book it: Create, while Available. */
  book: boolean;
};

export function unitActions(
  access: MemberAccess,
  unit: Pick<UnitSalesDetail, "projectId" | "status">,
): UnitActions {
  const scope = { projectId: unit.projectId };
  const update = can(access, BOOKING_MENU, "update", scope);
  return {
    editDetails: update,
    markUnavailable: update && unit.status === "available",
    markAvailable: update && unit.status === "unavailable",
    book:
      can(access, BOOKING_MENU, "create", scope) && unit.status === "available",
  };
}

function emptyCounts(): UnitSalesCounts {
  const counts = { total: 0 } as UnitSalesCounts;
  for (const status of UNIT_SALES_STATUSES) counts[status] = 0;
  return counts;
}

const NO_PROFILE: UnitProfileView = {
  unitType: null,
  carpetArea: null,
  builtUpArea: null,
  superBuiltUpArea: null,
  areaUnit: "sq_ft",
  unavailable: false,
  unavailableReason: null,
  unavailableNote: null,
  updatedAt: null,
};

function profileView(profile: StoredUnitProfile | undefined): UnitProfileView {
  if (profile == null) return NO_PROFILE;
  return {
    unitType: profile.unitType,
    carpetArea: profile.carpetArea,
    builtUpArea: profile.builtUpArea,
    superBuiltUpArea: profile.superBuiltUpArea,
    areaUnit: profile.areaUnit,
    unavailable: profile.unavailable,
    unavailableReason: profile.unavailableReason,
    unavailableNote: profile.unavailableNote,
    updatedAt: profile.updatedAt,
  };
}

function rowOf(
  unit: {
    unitId: string;
    wingId: string;
    workspaceId: string;
    projectId: string;
  },
  profile: UnitProfileView,
): UnitProfileRow {
  return {
    unitId: unit.unitId,
    workspaceId: unit.workspaceId,
    projectId: unit.projectId,
    wingId: unit.wingId,
    unitType: profile.unitType,
    carpetArea: profile.carpetArea,
    builtUpArea: profile.builtUpArea,
    superBuiltUpArea: profile.superBuiltUpArea,
    areaUnit: profile.areaUnit,
    unavailable: profile.unavailable,
    unavailableReason: profile.unavailableReason,
    unavailableNote: profile.unavailableNote,
  };
}

function snapshot(profile: UnitProfileView) {
  const { updatedAt: _updatedAt, ...rest } = profile;
  return rest;
}

export class UnitSalesHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: SalesBookingDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  /** A live unit on the Project, or 404 `UNIT_NOT_FOUND`. */
  async unitOnProject(
    db: SalesTx,
    workspaceId: string,
    projectId: string,
    unitId: string,
  ): Promise<SalesUnitFacts> {
    const unit = (
      await this.deps.directory.units(db, workspaceId, projectId, [unitId])
    ).get(unitId);
    if (unit == null || unit.deleted) throw unitNotFound();
    return unit;
  }

  /** The Units chart (Booking Read): every Wing's counts and one Wing's grid. */
  async chart(
    access: MemberAccess,
    projectId: string,
    wingId?: string,
  ): Promise<UnitChart> {
    assertCan(access, BOOKING_MENU, "read", { projectId });
    const { db, directory, profiles, bookings } = this.deps;
    const ws = access.workspaceId;
    const [today, wings, profileMap, active] = await Promise.all([
      this.deps.today(ws),
      directory.wings(db, ws, projectId),
      profiles.profiles(db, ws, projectId),
      bookings.active(db, ws, projectId),
    ]);
    const counts = emptyCounts();
    const unitOf = (unit: { id: string; name: string }): UnitChartUnit => {
      const profile = profileMap.get(unit.id);
      const booking = active.get(unit.id) ?? null;
      const status = unitSalesStatus(
        profile ?? null,
        booking == null
          ? null
          : {
              status: booking.status as "on_hold" | "booked",
              holdUntil: booking.holdUntil,
            },
        today,
      );
      return {
        id: unit.id,
        name: unit.name,
        status,
        unitType: profile?.unitType ?? null,
        carpetArea: profile?.carpetArea ?? null,
        areaUnit: profile?.areaUnit ?? "sq_ft",
        booking:
          booking == null
            ? null
            : {
                id: booking.id,
                status: bookingDisplayStatus(booking, today),
                customerName: booking.customerName,
                holdUntil: booking.holdUntil,
              },
      };
    };
    const charted = wings.map((wing: SalesWingTree) => {
      const wingCounts = emptyCounts();
      const floors = wing.floors.map((floor) => ({
        id: floor.id,
        name: floor.name,
        kind: floor.kind,
        units: floor.units.map((unit) => {
          const item = unitOf(unit);
          wingCounts[item.status] += 1;
          wingCounts.total += 1;
          counts[item.status] += 1;
          counts.total += 1;
          return item;
        }),
      }));
      return {
        id: wing.id,
        name: wing.name,
        type: wing.type,
        phaseName: wing.phaseName,
        counts: wingCounts,
        floors,
      };
    });
    const chosen =
      charted.find((wing) => wing.id === wingId) ?? charted[0] ?? null;
    return {
      today,
      counts,
      wings: charted.map(({ floors: _floors, ...wing }) => wing),
      wing: chosen,
    };
  }

  /** One unit's sales details and bookings (Booking Read). */
  async unit(
    access: MemberAccess,
    projectId: string,
    unitId: string,
  ): Promise<UnitSalesDetail> {
    assertCan(access, BOOKING_MENU, "read", { projectId });
    const { db, directory, profiles, bookings } = this.deps;
    const ws = access.workspaceId;
    const unit = await this.unitOnProject(db, ws, projectId, unitId);
    const [today, wings, profileMap, history] = await Promise.all([
      this.deps.today(ws),
      directory.wingsById(db, ws, projectId, [unit.wingId]),
      profiles.profiles(db, ws, projectId, [unitId]),
      bookings.ofUnit(db, ws, unitId),
    ]);
    const wing = wings.get(unit.wingId);
    const profile = profileView(profileMap.get(unitId));
    const summaries = history.map((booking) => ({
      ...booking,
      displayStatus: bookingDisplayStatus(booking, today),
    }));
    const booking =
      summaries.find(
        (item) => item.status === "on_hold" || item.status === "booked",
      ) ?? null;
    return {
      id: unit.id,
      name: unit.name,
      projectId,
      wing: {
        id: unit.wingId,
        name: wing?.name ?? "",
        type: wing?.type ?? "",
      },
      floor: { id: unit.floorId, name: unit.floorName },
      status: unitSalesStatus(
        profile,
        booking == null
          ? null
          : {
              status: booking.status as "on_hold" | "booked",
              holdUntil: booking.holdUntil,
            },
        today,
      ),
      profile,
      booking,
      bookings: summaries,
    };
  }

  /**
   * One write on a unit's profile: the unit's lock, the stale check
   * (`expectedUpdatedAt` null for a unit without details yet), the change
   * and its audit event.
   */
  private async write(
    access: MemberAccess,
    projectId: string,
    unitId: string,
    expectedUpdatedAt: Date | null,
    action: string,
    change: (
      tx: SalesTx,
      current: UnitProfileView,
      today: CalendarDate,
      at: Date,
    ) => Promise<UnitProfileView>,
  ): Promise<void> {
    assertCan(access, BOOKING_MENU, "update", { projectId });
    const { db, profiles, bookings } = this.deps;
    const ws = access.workspaceId;
    const unit = await this.unitOnProject(db, ws, projectId, unitId);
    const today = await this.deps.today(ws);
    const at = this.clock();
    await db.$transaction(async (tx) => {
      await bookings.lockUnits(tx, ws, [unitId]);
      const stored = (await profiles.profiles(tx, ws, projectId, [unitId])).get(
        unitId,
      );
      if (
        (stored?.updatedAt.getTime() ?? null) !==
        (expectedUpdatedAt?.getTime() ?? null)
      )
        throw unitProfileChanged(stored?.updatedAt ?? null);
      const current = profileView(stored);
      const next = await change(tx, current, today, at);
      await profiles.save(
        tx,
        [
          rowOf(
            { unitId, wingId: unit.wingId, workspaceId: ws, projectId },
            next,
          ),
        ],
        access.userId,
        at,
      );
      await recordAudit(tx, {
        workspaceId: ws,
        actorUserId: access.userId,
        action,
        entityType: "unit_profile",
        entityId: unitId,
        before: stored == null ? null : snapshot(current),
        after: snapshot(next),
        occurredAt: at,
      });
    });
  }

  /** Unit type, the three areas and the area unit (CM-0022 §8). */
  async setDetails(
    access: MemberAccess,
    projectId: string,
    unitId: string,
    expectedUpdatedAt: Date | null,
    input: UnitProfileInput,
  ): Promise<void> {
    const fields = unitProfileFields(input);
    await this.write(
      access,
      projectId,
      unitId,
      expectedUpdatedAt,
      "unit_profile.updated",
      (_tx, current) => Promise.resolve({ ...current, ...fields }),
    );
  }

  /**
   * Not for sale, with a reason and a note. 409 `UNIT_HAS_BOOKING` while a
   * booking holds it; a hold past its Hold until date is cancelled
   * ("Hold expired") in the same transaction.
   */
  async markUnavailable(
    access: MemberAccess,
    projectId: string,
    unitId: string,
    expectedUpdatedAt: Date | null,
    input: { reason: string; note?: string | null },
  ): Promise<void> {
    const fields = unavailableFields(input);
    await this.write(
      access,
      projectId,
      unitId,
      expectedUpdatedAt,
      "unit_profile.unavailable",
      async (tx, current, today, at) => {
        const booking = (
          await this.deps.bookings.active(tx, access.workspaceId, projectId, [
            unitId,
          ])
        ).get(unitId);
        if (booking != null) {
          const holding = await releaseExpiredHold(
            this.deps,
            tx,
            booking,
            today,
            at,
          );
          if (holding != null) throw unitHasBooking(holding.id);
        }
        return {
          ...current,
          unavailable: true,
          unavailableReason: fields.reason,
          unavailableNote: fields.note,
        };
      },
    );
  }

  /** For sale again: the reason and note are cleared. */
  async markAvailable(
    access: MemberAccess,
    projectId: string,
    unitId: string,
    expectedUpdatedAt: Date | null,
  ): Promise<void> {
    await this.write(
      access,
      projectId,
      unitId,
      expectedUpdatedAt,
      "unit_profile.available",
      (_tx, current) =>
        Promise.resolve({
          ...current,
          unavailable: false,
          unavailableReason: null,
          unavailableNote: null,
        }),
    );
  }
}
