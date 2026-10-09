import { normalizeMobile } from "@repo/auth/construction/mobile";

import {
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError, notFound } from "@/src/shared-kernel/domain-error";

import { MAX_PAISE } from "./labour";

export const VENDOR_NAME_MAX = 120;
export const VENDOR_ADDRESS_MAX = 500;
export const VENDOR_SHIFT_NAME_MAX = 40;

/** What a vendor charges per head for one Labour Category on one shift. Paise. */
export type VendorRate = {
  labourCategoryId: string;
  ratePerDay: number;
  overtimePerHour: number;
};

/** One shift of the rate card ("Shift 1", "Night"…), with its rates. */
export type VendorShift = {
  id: string;
  name: string;
  /** `HH:MM`, 24-hour. */
  startTime: string | null;
  endTime: string | null;
  sortOrder: number;
  rates: VendorRate[];
};

/**
 * A rate card shift as a form sends it. `id` keeps an existing shift (so
 * attendance that used it still points at it); a rate amount left `null`
 * keeps that shift's current rate for the category (a Team Member without
 * Financial cannot see or send amounts).
 */
export type VendorShiftInput = {
  id?: string | null;
  name: string;
  startTime?: string | null;
  endTime?: string | null;
  rates: {
    labourCategoryId: string;
    ratePerDay: number | null;
    overtimePerHour: number | null;
  }[];
};

export type VendorDetailsInput = {
  name: string;
  joiningDate: string;
  contactNumber?: string | null;
  address?: string | null;
};

export type VendorProps = {
  id: string;
  workspaceId: string;
  name: string;
  joiningDate: CalendarDate;
  /** E.164. */
  contactNumber: string | null;
  address: string | null;
  isActive: boolean;
  /** Storage key of the photo; set only through the party-files module. */
  photoKey: string | null;
  projectIds: string[];
  /** Live shifts in order; removed shifts are not part of the aggregate. */
  shifts: VendorShift[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  deletedAt: Date | null;
};

function cleanName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0)
    throw new DomainError("VENDOR_NAME_REQUIRED", "Enter the Vendor name.");
  if (name.length > VENDOR_NAME_MAX)
    throw new DomainError(
      "VENDOR_NAME_TOO_LONG",
      `Vendor name must be at most ${String(VENDOR_NAME_MAX)} characters.`,
    );
  return name;
}

function cleanJoiningDate(raw: string): CalendarDate {
  return assertCalendarDate(raw.trim(), "VENDOR_JOINING_DATE_INVALID");
}

function cleanContact(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? "";
  if (value.length === 0) return null;
  const mobile = normalizeMobile(value);
  if (mobile == null)
    throw new DomainError(
      "VENDOR_CONTACT_NUMBER_INVALID",
      "Enter a valid mobile number, like 77081 65767.",
    );
  return mobile;
}

function cleanAddress(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? "";
  if (value.length === 0) return null;
  if (value.length > VENDOR_ADDRESS_MAX)
    throw new DomainError(
      "VENDOR_ADDRESS_TOO_LONG",
      `Address must be at most ${String(VENDOR_ADDRESS_MAX)} characters.`,
    );
  return value;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function cleanTime(
  raw: string | null | undefined,
  shiftIndex: number,
  field: "startTime" | "endTime",
): string | null {
  const value = raw?.trim() ?? "";
  if (value.length === 0) return null;
  if (!TIME_RE.test(value))
    throw new DomainError(
      "SHIFT_TIME_INVALID",
      "Enter shift times as HH:MM (24-hour).",
      { details: { shiftIndex, field } },
    );
  return value;
}

function amount(
  value: number,
  shiftIndex: number,
  rateIndex: number,
  field: "ratePerDay" | "overtimePerHour",
): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_PAISE)
    throw new DomainError(
      "VENDOR_RATE_INVALID",
      "Rates are whole paise, zero or more, up to ₹2,00,00,000.",
      { details: { shiftIndex, rateIndex, field } },
    );
  return value;
}

/**
 * The whole rate card from a form, checked (`modules/08`, "Decisions for the
 * build"): every shift has a name unique within the vendor and at least one
 * category rate; a category appears once per shift. `current` supplies the
 * rates a `null` amount keeps and the ids that stay.
 */
export function buildRateCard(
  input: readonly VendorShiftInput[],
  current: readonly VendorShift[],
  newShiftId: () => string,
): VendorShift[] {
  const byId = new Map(current.map((shift) => [shift.id, shift]));
  const names = new Set<string>();
  const usedIds = new Set<string>();
  return input.map((shift, shiftIndex) => {
    const name = shift.name.trim().replace(/\s+/g, " ");
    if (name.length === 0)
      throw new DomainError("SHIFT_NAME_REQUIRED", "Enter the shift name.", {
        details: { shiftIndex },
      });
    if (name.length > VENDOR_SHIFT_NAME_MAX)
      throw new DomainError(
        "SHIFT_NAME_TOO_LONG",
        `Shift name must be at most ${String(VENDOR_SHIFT_NAME_MAX)} characters.`,
        { details: { shiftIndex } },
      );
    const key = name.toLocaleLowerCase("en");
    if (names.has(key))
      throw new DomainError(
        "DUPLICATE_SHIFT_NAME",
        `There is already a shift called “${name}”.`,
        { details: { shiftIndex } },
      );
    names.add(key);

    const existing =
      shift.id != null && !usedIds.has(shift.id)
        ? byId.get(shift.id)
        : undefined;
    if (shift.id != null && existing == null)
      throw notFound(
        "VENDOR_SHIFT_NOT_FOUND",
        "This shift was removed. Reload to see the current rate card.",
      );
    const id = existing?.id ?? newShiftId();
    usedIds.add(id);

    if (shift.rates.length === 0)
      throw new DomainError(
        "SHIFT_RATES_REQUIRED",
        "Add at least one Labour Category rate to the shift.",
        { details: { shiftIndex } },
      );
    const categories = new Set<string>();
    const kept = new Map(
      (existing?.rates ?? []).map((rate) => [rate.labourCategoryId, rate]),
    );
    const rates = shift.rates.map((rate, rateIndex): VendorRate => {
      if (categories.has(rate.labourCategoryId))
        throw new DomainError(
          "DUPLICATE_SHIFT_CATEGORY",
          "A Labour Category can be on a shift only once.",
          { details: { shiftIndex, rateIndex } },
        );
      categories.add(rate.labourCategoryId);
      const previous = kept.get(rate.labourCategoryId);
      const ratePerDay = rate.ratePerDay ?? previous?.ratePerDay;
      const overtimePerHour = rate.overtimePerHour ?? previous?.overtimePerHour;
      if (ratePerDay == null || overtimePerHour == null)
        throw new DomainError(
          "VENDOR_RATE_REQUIRED",
          "Enter the rate per day and overtime per hour.",
          { details: { shiftIndex, rateIndex } },
        );
      return {
        labourCategoryId: rate.labourCategoryId,
        ratePerDay: amount(ratePerDay, shiftIndex, rateIndex, "ratePerDay"),
        overtimePerHour: amount(
          overtimePerHour,
          shiftIndex,
          rateIndex,
          "overtimePerHour",
        ),
      };
    });

    return {
      id,
      name,
      startTime: cleanTime(shift.startTime, shiftIndex, "startTime"),
      endTime: cleanTime(shift.endTime, shiftIndex, "endTime"),
      sortOrder: shiftIndex,
      rates,
    };
  });
}

/**
 * A labour-supply Vendor (a gang or mukadam) and its rate card (CM-208,
 * `modules/08`). Not a User. A vendor may be saved without shifts — the
 * register shows "No rate card" — but attendance cannot be recorded until
 * it has at least one shift with one category rate. The opening balance is
 * a ledger entry, not part of the aggregate (ADR CM-0004).
 */
export class Vendor {
  private constructor(private props: VendorProps) {}

  static create(input: {
    id: string;
    workspaceId: string;
    details: VendorDetailsInput;
    projectIds: readonly string[];
    shifts: readonly VendorShiftInput[];
    newShiftId: () => string;
    by: string;
    now: Date;
  }): Vendor {
    return new Vendor({
      id: input.id,
      workspaceId: input.workspaceId,
      name: cleanName(input.details.name),
      joiningDate: cleanJoiningDate(input.details.joiningDate),
      contactNumber: cleanContact(input.details.contactNumber),
      address: cleanAddress(input.details.address),
      isActive: true,
      photoKey: null,
      projectIds: [...new Set(input.projectIds)],
      shifts: buildRateCard(input.shifts, [], input.newShiftId),
      createdAt: input.now,
      updatedAt: input.now,
      createdBy: input.by,
      updatedBy: input.by,
      deletedAt: null,
    });
  }

  static reconstitute(props: VendorProps): Vendor {
    return new Vendor(props);
  }

  get id(): string {
    return this.props.id;
  }
  get workspaceId(): string {
    return this.props.workspaceId;
  }
  get name(): string {
    return this.props.name;
  }
  get joiningDate(): CalendarDate {
    return this.props.joiningDate;
  }
  get contactNumber(): string | null {
    return this.props.contactNumber;
  }
  get address(): string | null {
    return this.props.address;
  }
  get isActive(): boolean {
    return this.props.isActive;
  }
  get photoKey(): string | null {
    return this.props.photoKey;
  }
  get projectIds(): readonly string[] {
    return this.props.projectIds;
  }
  get shifts(): readonly VendorShift[] {
    return this.props.shifts;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get updatedBy(): string {
    return this.props.updatedBy;
  }
  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }

  /** At least one shift with at least one category rate. */
  get hasRateCard(): boolean {
    return this.props.shifts.some((shift) => shift.rates.length > 0);
  }

  /** Every Labour Category anywhere on the rate card. */
  get categoryIds(): ReadonlySet<string> {
    return new Set(
      this.props.shifts.flatMap((shift) =>
        shift.rates.map((rate) => rate.labourCategoryId),
      ),
    );
  }

  /**
   * One command updates the details, the Projects and the whole rate card
   * (CM-209). Shifts left out are removed (the store soft-deletes them).
   */
  update(input: {
    details: VendorDetailsInput;
    projectIds: readonly string[];
    shifts: readonly VendorShiftInput[];
    newShiftId: () => string;
    by: string;
    now: Date;
  }): void {
    this.assertLive();
    this.props = {
      ...this.props,
      name: cleanName(input.details.name),
      joiningDate: cleanJoiningDate(input.details.joiningDate),
      contactNumber: cleanContact(input.details.contactNumber),
      address: cleanAddress(input.details.address),
      projectIds: [...new Set(input.projectIds)],
      shifts: buildRateCard(input.shifts, this.props.shifts, input.newShiftId),
      updatedAt: input.now,
      updatedBy: input.by,
    };
  }

  setActive(isActive: boolean, by: string, now: Date): void {
    this.assertLive();
    this.props = { ...this.props, isActive, updatedAt: now, updatedBy: by };
  }

  delete(by: string, now: Date): void {
    this.assertLive();
    this.props = {
      ...this.props,
      deletedAt: now,
      updatedAt: now,
      updatedBy: by,
    };
  }

  /**
   * The rate attendance prices a line at (CM-212): refused for an inactive
   * vendor, a vendor without a rate card, or a category not on that shift.
   */
  rateFor(
    shiftId: string,
    labourCategoryId: string,
  ): VendorRate & {
    shiftName: string;
  } {
    if (!this.props.isActive)
      throw new DomainError(
        "VENDOR_INACTIVE",
        "This Vendor is inactive. Activate them to record attendance.",
      );
    if (!this.hasRateCard)
      throw new DomainError(
        "VENDOR_NO_RATE_CARD",
        "Add a shift with at least one Labour Category rate before recording attendance.",
      );
    const shift = this.props.shifts.find((item) => item.id === shiftId);
    if (shift == null)
      throw new DomainError(
        "VENDOR_SHIFT_NOT_FOUND",
        "This shift is not on the Vendor's rate card.",
      );
    const rate = shift.rates.find(
      (item) => item.labourCategoryId === labourCategoryId,
    );
    if (rate == null)
      throw new DomainError(
        "CATEGORY_NOT_ON_SHIFT",
        `This Labour Category has no rate on ${shift.name}.`,
      );
    return { ...rate, shiftName: shift.name };
  }

  private assertLive(): void {
    if (this.props.deletedAt != null)
      throw notFound("VENDOR_NOT_FOUND", "This Vendor was not found.");
  }
}
