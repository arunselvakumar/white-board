import { assertCan, type MemberAccess } from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  AREA_UNIT_LABELS,
  AREA_UNITS,
  SALES_LIMITS,
  UNAVAILABLE_REASON_LABELS,
  UNAVAILABLE_REASONS,
  type AreaUnit,
  type UnavailableReason,
} from "../domain/sales-terms";
import { parseArea } from "../domain/unit-profile";
import type { UnitProfileRow } from "./booking-ports";
import {
  BOOKING_MENU,
  releaseExpiredHold,
  type SalesBookingDeps,
} from "./sales-booking-deps";

/**
 * Unit import (CM-1005, ADR CM-0022 §8): an Excel sheet of the Project's
 * units updates their sales profiles. It never creates Wings, Floors or
 * Units (the Wing editor does): each row names an existing unit by Wing
 * name and Unit No, ignoring case. A row is the unit's whole profile —
 * a blank cell clears it — so the sample comes filled with today's
 * values. All rows or none, at most 2,000, every problem by row.
 */

export const UNIT_IMPORT_COLUMNS = [
  { key: "wing", header: "Wing*", width: 18 },
  { key: "unitNo", header: "Unit No*", width: 12 },
  { key: "unitType", header: "Unit type", width: 14 },
  { key: "carpetArea", header: "Carpet area", width: 14 },
  { key: "builtUpArea", header: "Built-up area", width: 14 },
  { key: "superBuiltUpArea", header: "Super built-up area", width: 20 },
  { key: "areaUnit", header: "Area unit", width: 11 },
  { key: "unavailable", header: "Unavailable", width: 13 },
  { key: "unavailableReason", header: "Unavailable reason", width: 20 },
] as const;

export type UnitImportColumnKey = (typeof UNIT_IMPORT_COLUMNS)[number]["key"];

export type UnitImportCell = string | number | Date | null;

export type UnitSheetRow = {
  /** The row number in the sheet (the header is row 1). */
  row: number;
  cells: Partial<Record<UnitImportColumnKey, UnitImportCell>>;
};

export type UnitImportRowError = {
  row: number;
  field: string;
  message: string;
};

/** One prefilled sample row: a unit with its current profile, as words. */
export type UnitSampleRow = Record<UnitImportColumnKey, string | number | null>;

const HEADER_OF = Object.fromEntries(
  UNIT_IMPORT_COLUMNS.map((column) => [column.key, column.header]),
) as Record<UnitImportColumnKey, string>;

function text(cell: UnitImportCell | undefined): string {
  if (cell == null) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell).trim().replace(/\s+/g, " ");
}

const key = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

const UNIT_BY_WORD = new Map<string, AreaUnit>([
  ...AREA_UNITS.map((unit) => [key(AREA_UNIT_LABELS[unit]), unit] as const),
  ...AREA_UNITS.map((unit) => [unit.replace("_", ""), unit] as const),
  ...AREA_UNITS.map((unit) => [unit, unit] as const),
  ["sqft", "sq_ft"],
  ["sq.ft", "sq_ft"],
  ["sq. ft", "sq_ft"],
  ["square feet", "sq_ft"],
  ["sqm", "sq_m"],
  ["sq.m", "sq_m"],
  ["sq. m", "sq_m"],
  ["square metres", "sq_m"],
  ["square meters", "sq_m"],
]);

const REASON_BY_WORD = new Map<string, UnavailableReason>([
  ...UNAVAILABLE_REASONS.map(
    (reason) => [key(UNAVAILABLE_REASON_LABELS[reason]), reason] as const,
  ),
  ...UNAVAILABLE_REASONS.map((reason) => [reason, reason] as const),
]);

/** The prefilled sample's rows: every live unit, Wing by Wing, top floor first. */
export async function unitImportSampleRows(
  deps: SalesBookingDeps,
  access: MemberAccess,
  projectId: string,
): Promise<UnitSampleRow[]> {
  assertCan(access, BOOKING_MENU, "read", { projectId });
  const ws = access.workspaceId;
  const [wings, profiles] = await Promise.all([
    deps.directory.wings(deps.db, ws, projectId),
    deps.profiles.profiles(deps.db, ws, projectId),
  ]);
  const area = (value: string | null) => (value == null ? null : Number(value));
  return wings.flatMap((wing) =>
    wing.floors.flatMap((floor) =>
      floor.units.map((unit) => {
        const profile = profiles.get(unit.id);
        return {
          wing: wing.name,
          unitNo: unit.name,
          unitType: profile?.unitType ?? null,
          carpetArea: area(profile?.carpetArea ?? null),
          builtUpArea: area(profile?.builtUpArea ?? null),
          superBuiltUpArea: area(profile?.superBuiltUpArea ?? null),
          areaUnit: AREA_UNIT_LABELS[profile?.areaUnit ?? "sq_ft"],
          unavailable: profile?.unavailable === true ? "Yes" : "No",
          unavailableReason:
            profile?.unavailableReason == null
              ? null
              : UNAVAILABLE_REASON_LABELS[profile.unavailableReason],
        };
      }),
    ),
  );
}

/**
 * Checks every row, then writes them all in one transaction holding the
 * units' locks. Any error anywhere rolls back everything: 400
 * `IMPORT_HAS_ERRORS` with `details.errors` = [{ row, field, message }].
 * Needs Booking Update (the menu has no Import flag). A unit made
 * Unavailable while a booking holds it is an error; a hold past its Hold
 * until date is cancelled ("Hold expired"), as on the unit panel.
 */
export async function importUnitProfiles(
  deps: SalesBookingDeps,
  access: MemberAccess,
  projectId: string,
  rows: readonly UnitSheetRow[],
): Promise<{ updated: number }> {
  assertCan(access, BOOKING_MENU, "update", { projectId });
  if (rows.length === 0)
    throw new DomainError(
      "IMPORT_EMPTY",
      "The sheet has no rows under its headers.",
    );
  if (rows.length > SALES_LIMITS.unitImportRows)
    throw new DomainError(
      "IMPORT_TOO_MANY",
      `Import at most ${SALES_LIMITS.unitImportRows.toLocaleString("en-IN")} rows at a time.`,
    );
  const ws = access.workspaceId;
  const wings = await deps.directory.wings(deps.db, ws, projectId);
  const wingsByName = new Map<string, typeof wings>();
  for (const wing of wings)
    wingsByName.set(key(wing.name), [
      ...(wingsByName.get(key(wing.name)) ?? []),
      wing,
    ]);

  const errors: UnitImportRowError[] = [];
  const planned: (UnitProfileRow & { row: number })[] = [];
  const seen = new Map<string, number>();
  for (const { row, cells } of rows) {
    const fail = (column: UnitImportColumnKey, message: string) => {
      errors.push({ row, field: HEADER_OF[column], message });
    };
    const wingName = text(cells.wing);
    const unitNo = text(cells.unitNo);
    let unit: { id: string; wingId: string } | null = null;
    if (wingName === "") fail("wing", "Enter the Wing's name.");
    else {
      const found = wingsByName.get(key(wingName)) ?? [];
      if (found.length === 0)
        fail("wing", `No Wing of this Project is named “${wingName}”.`);
      else if (found.length > 1)
        fail("wing", `More than one Wing is named “${wingName}”.`);
      else if (unitNo === "") fail("unitNo", "Enter the Unit No.");
      else {
        const wing = found[0];
        const units =
          wing?.floors.flatMap((floor) =>
            floor.units.filter((item) => key(item.name) === key(unitNo)),
          ) ?? [];
        if (units.length === 0 || wing == null)
          fail("unitNo", `${wingName} has no unit “${unitNo}”.`);
        else if (units.length > 1)
          fail(
            "unitNo",
            `${wingName} has more than one unit “${unitNo}”; rename them in the Wing editor.`,
          );
        else if (units[0] != null) unit = { id: units[0].id, wingId: wing.id };
      }
    }
    if (unit != null) {
      const first = seen.get(unit.id);
      if (first != null) {
        fail("unitNo", `This unit is already on row ${String(first)}.`);
        unit = null;
      } else seen.set(unit.id, row);
    }
    const unitType = text(cells.unitType);
    if (unitType.length > SALES_LIMITS.unitType)
      fail(
        "unitType",
        `Keep the Unit type to ${String(SALES_LIMITS.unitType)} characters.`,
      );
    const area = (
      column: "carpetArea" | "builtUpArea" | "superBuiltUpArea",
    ): string | null => {
      const cell = cells[column];
      try {
        return parseArea(typeof cell === "number" ? cell : text(cell), column);
      } catch (error) {
        fail(
          column,
          error instanceof DomainError
            ? error.message
            : "Enter a number with at most two decimals.",
        );
        return null;
      }
    };
    const carpetArea = area("carpetArea");
    const builtUpArea = area("builtUpArea");
    const superBuiltUpArea = area("superBuiltUpArea");
    const unitWord = key(text(cells.areaUnit));
    const areaUnit: AreaUnit | undefined =
      unitWord === "" ? "sq_ft" : UNIT_BY_WORD.get(unitWord);
    if (areaUnit == null) fail("areaUnit", "Write sq ft or sq m.");
    const flag = key(text(cells.unavailable));
    let unavailable = false;
    if (flag === "yes" || flag === "y" || flag === "true") unavailable = true;
    else if (!(
      flag === "" ||
      flag === "no" ||
      flag === "n" ||
      flag === "false"
    ))
      fail("unavailable", "Write Yes or No.");
    const reasonWord = key(text(cells.unavailableReason));
    let unavailableReason: UnavailableReason | null = null;
    if (unavailable) {
      const reason = REASON_BY_WORD.get(reasonWord);
      if (reasonWord === "")
        fail(
          "unavailableReason",
          "Give the reason: Landowner share, Reserved, Not for sale or Other.",
        );
      else if (reason == null)
        fail(
          "unavailableReason",
          "Write Landowner share, Reserved, Not for sale or Other.",
        );
      else unavailableReason = reason;
    }
    if (unit != null && areaUnit != null)
      planned.push({
        row,
        unitId: unit.id,
        wingId: unit.wingId,
        workspaceId: ws,
        projectId,
        unitType: unitType === "" ? null : unitType,
        carpetArea,
        builtUpArea,
        superBuiltUpArea,
        areaUnit,
        unavailable,
        unavailableReason,
        unavailableNote: null,
      });
  }
  const sorted = () =>
    [...errors].sort((a, b) => a.row - b.row || a.field.localeCompare(b.field));
  if (errors.length > 0)
    throw new DomainError(
      "IMPORT_HAS_ERRORS",
      `The sheet has ${String(errors.length)} ${errors.length === 1 ? "problem" : "problems"}. Fix them and upload it again; nothing was saved.`,
      { details: { errors: sorted() } },
    );

  const today = await deps.today(ws);
  const at = (deps.clock ?? (() => new Date()))();
  await deps.db.$transaction(async (tx) => {
    const unitIds = planned.map((row) => row.unitId);
    await deps.bookings.lockUnits(tx, ws, unitIds);
    const [stored, active] = await Promise.all([
      deps.profiles.profiles(tx, ws, projectId, unitIds),
      deps.bookings.active(tx, ws, projectId, unitIds),
    ]);
    for (const row of planned) {
      const booking = active.get(row.unitId);
      if (!row.unavailable || booking == null) continue;
      // Confirm and Extend hold lock only the booking row, so the hold is
      // read again under its lock before it is cancelled as expired; any
      // cancellation is rolled back if a row has a problem.
      const holding = await releaseExpiredHold(deps, tx, booking, today, at);
      if (holding != null)
        errors.push({
          row: row.row,
          field: HEADER_OF.unavailable,
          message:
            "This unit is on hold or booked. Cancel the booking before marking it unavailable.",
        });
    }
    if (errors.length > 0)
      throw new DomainError(
        "IMPORT_HAS_ERRORS",
        `The sheet has ${String(errors.length)} ${errors.length === 1 ? "problem" : "problems"}. Fix them and upload it again; nothing was saved.`,
        { details: { errors: sorted() } },
      );
    for (const row of planned) {
      // An unchanged unit keeps its note.
      const before = stored.get(row.unitId);
      if (
        before?.unavailable === row.unavailable &&
        before.unavailableReason === row.unavailableReason
      )
        row.unavailableNote = before.unavailableNote;
    }
    await deps.profiles.save(
      tx,
      planned.map(({ row: _row, ...profile }) => profile),
      access.userId,
      at,
    );
    await recordAudit(tx, {
      workspaceId: ws,
      actorUserId: access.userId,
      action: "unit_profile.imported",
      entityType: "project",
      entityId: projectId,
      after: { units: planned.length },
      occurredAt: at,
    });
  });
  return { updated: planned.length };
}
