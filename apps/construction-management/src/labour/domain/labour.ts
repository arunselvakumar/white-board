import { normalizeMobile } from "@repo/auth/construction/mobile";

import {
  isCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError, conflict } from "@/src/shared-kernel/domain-error";
import {
  isValidAadhaar,
  maskIdentifier,
  normalizeAadhaar,
} from "@/src/shared-kernel/tax-ids";

import type { WageType, Weekday } from "./wages";

export type Gender = "male" | "female" | "other";

export const GENDERS: readonly Gender[] = ["male", "female", "other"];
export const WAGE_TYPES: readonly WageType[] = ["daily", "monthly"];

/** Wages and the opening balance stay within a Postgres `integer` of paise. */
export const MAX_PAISE = 2_000_000_000;

/**
 * A labourer's register entry (`modules/08` Labour, CM-205). Amounts are
 * integer paise. The wage of the other wage type is always null.
 */
export type LabourDetails = {
  name: string;
  /** The Company's own "Labour Id"; unique among live labourers. */
  labourCode: string | null;
  fatherName: string | null;
  joiningDate: CalendarDate;
  wageType: WageType;
  wagePerDay: number | null;
  wagePerMonth: number | null;
  overtimeWagePerHour: number;
  /** 0 = Sunday … 6 = Saturday, sorted, unique. */
  weeklyHolidays: Weekday[];
  /** EPFO UAN, 12 digits. */
  uanNumber: string | null;
  /** ESIC insurance number, 10 or 17 digits. */
  esicNumber: string | null;
  /** Plain while in memory; stored encrypted. */
  aadhaar: string | null;
  labourCategoryId: string | null;
  supervisorId: string | null;
  /** E.164. */
  contactNumber: string | null;
  gender: Gender | null;
};

export type LabourDetailsInput = {
  name: string;
  labourCode?: string | null;
  fatherName?: string | null;
  joiningDate: string;
  wageType: string;
  wagePerDay?: number | null;
  wagePerMonth?: number | null;
  overtimeWagePerHour: number | null;
  weeklyHolidays?: readonly number[] | null;
  uanNumber?: string | null;
  esicNumber?: string | null;
  aadhaar?: string | null;
  labourCategoryId?: string | null;
  supervisorId?: string | null;
  contactNumber?: string | null;
  gender?: string | null;
};

/** One problem with one field, for forms and the Excel import preview. */
export type FieldProblem = {
  field: keyof LabourDetailsInput | "openingBalance" | "currentProjectId";
  code: string;
  message: string;
};

function optional(value: string | null | undefined): string | null {
  const trimmed = value?.trim().replace(/\s+/g, " ") ?? "";
  return trimmed.length === 0 ? null : trimmed;
}

function isPaise(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    Math.abs(value) <= MAX_PAISE
  );
}

/**
 * Checks every field and returns all problems at once (the import preview
 * shows them per row). `labourDetails` throws the first.
 */
export function checkLabourDetails(
  input: LabourDetailsInput,
): { details: LabourDetails; problems: [] } | { problems: FieldProblem[] } {
  const problems: FieldProblem[] = [];
  const problem = (
    field: FieldProblem["field"],
    code: string,
    message: string,
  ) => {
    problems.push({ field, code, message });
  };

  const name = optional(input.name) ?? "";
  if (name.length === 0)
    problem("name", "LABOUR_NAME_REQUIRED", "Enter the labourer's name.");
  else if (name.length > 100)
    problem(
      "name",
      "LABOUR_NAME_TOO_LONG",
      "Name must be at most 100 characters.",
    );

  const labourCode = optional(input.labourCode);
  if (labourCode != null && labourCode.length > 30)
    problem(
      "labourCode",
      "LABOUR_CODE_TOO_LONG",
      "Labour Id must be at most 30 characters.",
    );

  const fatherName = optional(input.fatherName);
  if (fatherName != null && fatherName.length > 100)
    problem(
      "fatherName",
      "FATHER_NAME_TOO_LONG",
      "Father's name must be at most 100 characters.",
    );

  const joiningDate = input.joiningDate.trim();
  if (!isCalendarDate(joiningDate))
    problem(
      "joiningDate",
      "JOINING_DATE_INVALID",
      "Enter the joining date (YYYY-MM-DD).",
    );

  const wageType = input.wageType as WageType;
  const wageTypeValid = WAGE_TYPES.includes(wageType);
  if (!wageTypeValid)
    problem("wageType", "WAGE_TYPE_INVALID", "Choose Daily or Monthly wages.");

  // The wage of the chosen type is required and more than zero; the other
  // wage is cleared, so changing the wage type never leaves two wages.
  const wageField = wageType === "monthly" ? "wagePerMonth" : "wagePerDay";
  const wage = wageType === "monthly" ? input.wagePerMonth : input.wagePerDay;
  if (wageTypeValid) {
    if (wage == null || wage === 0)
      problem(
        wageField,
        "WAGE_REQUIRED",
        wageType === "monthly"
          ? "Enter the wage per month."
          : "Enter the wage per day.",
      );
    else if (!isPaise(wage) || wage < 0)
      problem(
        wageField,
        "WAGE_INVALID",
        "The wage must be a positive amount in paise.",
      );
  }

  const overtime = input.overtimeWagePerHour;
  if (overtime == null)
    problem(
      "overtimeWagePerHour",
      "OVERTIME_WAGE_REQUIRED",
      "Enter the overtime wage per hour (0 when there is none).",
    );
  else if (!isPaise(overtime) || overtime < 0)
    problem(
      "overtimeWagePerHour",
      "OVERTIME_WAGE_INVALID",
      "The overtime wage must be 0 or more, in paise.",
    );

  const holidays = [...(input.weeklyHolidays ?? [])];
  if (
    holidays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) ||
    new Set(holidays).size !== holidays.length
  )
    problem(
      "weeklyHolidays",
      "WEEKLY_HOLIDAYS_INVALID",
      "Weekly holidays are weekdays 0 (Sunday) to 6 (Saturday), each once.",
    );

  const uanNumber = optional(input.uanNumber)?.replace(/\s/g, "") ?? null;
  if (uanNumber != null && !/^\d{12}$/.test(uanNumber))
    problem("uanNumber", "UAN_INVALID", "The UAN is 12 digits.");

  const esicNumber = optional(input.esicNumber)?.replace(/\s/g, "") ?? null;
  if (esicNumber != null && !/^(\d{10}|\d{17})$/.test(esicNumber))
    problem(
      "esicNumber",
      "ESIC_INVALID",
      "The ESIC number is 10 or 17 digits.",
    );

  const aadhaarRaw = optional(input.aadhaar);
  const aadhaar = aadhaarRaw == null ? null : normalizeAadhaar(aadhaarRaw);
  if (aadhaar != null && !isValidAadhaar(aadhaar))
    problem(
      "aadhaar",
      "AADHAAR_INVALID",
      "Enter a valid 12-digit Aadhaar number.",
    );

  const contactRaw = optional(input.contactNumber);
  const contactNumber = contactRaw == null ? null : normalizeMobile(contactRaw);
  if (contactRaw != null && contactNumber == null)
    problem("contactNumber", "MOBILE_INVALID", "Enter a valid mobile number.");

  const gender = optional(input.gender) as Gender | null;
  if (gender != null && !GENDERS.includes(gender))
    problem("gender", "GENDER_INVALID", "Choose Male, Female or Other.");

  if (problems.length > 0) return { problems };
  return {
    problems: [],
    details: {
      name,
      labourCode,
      fatherName,
      joiningDate,
      wageType,
      wagePerDay: wageType === "daily" ? (wage ?? null) : null,
      wagePerMonth: wageType === "monthly" ? (wage ?? null) : null,
      overtimeWagePerHour: overtime ?? 0,
      weeklyHolidays: holidays.sort((a, b) => a - b) as Weekday[],
      uanNumber,
      esicNumber,
      aadhaar,
      labourCategoryId: optional(input.labourCategoryId),
      supervisorId: optional(input.supervisorId),
      contactNumber,
      gender,
    },
  };
}

/** Validates and tidies a labourer's details; throws the first problem. */
export function labourDetails(input: LabourDetailsInput): LabourDetails {
  const checked = checkLabourDetails(input);
  const [first] = checked.problems;
  if (first != null)
    throw new DomainError(first.code, first.message, {
      details: { field: first.field },
    });
  if (!("details" in checked)) throw new Error("unreachable");
  return checked.details;
}

/**
 * Opening balance in paise, signed: positive is owed to the labourer, a
 * negative one is an advance given before the app (ADR CM-0004).
 */
export function openingBalance(value: number | null | undefined): number {
  const amount = value ?? 0;
  if (!isPaise(amount))
    throw new DomainError(
      "OPENING_BALANCE_INVALID",
      "The opening balance must be a whole number of paise.",
      { details: { field: "openingBalance" } },
    );
  return amount;
}

/** `XXXXXXXX9012`. */
export function maskAadhaar(aadhaar: string | null): string | null {
  return aadhaar == null ? null : maskIdentifier(aadhaar);
}

export type LabourProps = {
  id: string;
  workspaceId: string;
  details: LabourDetails;
  /** Changes only by a transfer (CM-206). */
  currentProjectId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  deletedAt: Date | null;
};

/**
 * A labourer on the Company's own roll (CM-205). A record, not a User. The
 * opening balance is a ledger entry, not a field (ADR CM-0004).
 */
export class Labour {
  private constructor(private props: LabourProps) {}

  static create(input: {
    id: string;
    workspaceId: string;
    details: LabourDetails;
    projectId: string;
    by: string;
    now: Date;
  }): Labour {
    if (input.projectId.trim().length === 0)
      throw new DomainError("PROJECT_REQUIRED", "Choose the Project.", {
        details: { field: "currentProjectId" },
      });
    return new Labour({
      id: input.id,
      workspaceId: input.workspaceId,
      details: input.details,
      currentProjectId: input.projectId,
      isActive: true,
      createdAt: input.now,
      updatedAt: input.now,
      createdBy: input.by,
      updatedBy: input.by,
      deletedAt: null,
    });
  }

  static reconstitute(props: LabourProps): Labour {
    return new Labour({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get workspaceId(): string {
    return this.props.workspaceId;
  }
  get details(): LabourDetails {
    return this.props.details;
  }
  get currentProjectId(): string {
    return this.props.currentProjectId;
  }
  get isActive(): boolean {
    return this.props.isActive;
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

  private touch(by: string, now: Date): void {
    this.props.updatedAt = now;
    this.props.updatedBy = by;
  }

  private assertLive(): void {
    if (this.props.deletedAt != null)
      throw new DomainError("LABOUR_NOT_FOUND", "This labourer was deleted.", {
        kind: "not_found",
      });
  }

  update(details: LabourDetails, by: string, now: Date): void {
    this.assertLive();
    this.props.details = details;
    this.touch(by, now);
  }

  activate(by: string, now: Date): void {
    this.assertLive();
    if (this.props.isActive) return;
    this.props.isActive = true;
    this.touch(by, now);
  }

  deactivate(by: string, now: Date): void {
    this.assertLive();
    if (!this.props.isActive) return;
    this.props.isActive = false;
    this.touch(by, now);
  }

  /**
   * Moves the labourer to another Project (CM-206). The balance belongs to
   * the labourer and moves with them; the date rules are checked by the
   * command against attendance and history.
   */
  transferTo(projectId: string, by: string, now: Date): string {
    this.assertLive();
    if (projectId === this.props.currentProjectId)
      throw conflict(
        "TRANSFER_SAME_PROJECT",
        `${this.props.details.name} already works on this Project. Choose another Project.`,
        { labourId: this.props.id },
      );
    const from = this.props.currentProjectId;
    this.props.currentProjectId = projectId;
    this.touch(by, now);
    return from;
  }

  delete(by: string, now: Date): void {
    this.assertLive();
    this.props.deletedAt = now;
    this.touch(by, now);
  }
}

/**
 * The transfer date rules (CM-206): on or after the labourer's last
 * transfer (the first is the joining date), and after every day they were
 * marked in attendance, since attendance from the transfer date is marked
 * in the new Project.
 */
export function assertTransferDate(input: {
  name: string;
  transferDate: CalendarDate;
  lastTransferDate: CalendarDate | null;
  latestAttendanceDate: CalendarDate | null;
}): void {
  if (
    input.lastTransferDate != null &&
    input.transferDate < input.lastTransferDate
  )
    throw conflict(
      "TRANSFER_BEFORE_LAST_TRANSFER",
      `${input.name} moved to their current Project on ${input.lastTransferDate}. Choose that date or later.`,
      { lastTransferDate: input.lastTransferDate },
    );
  if (
    input.latestAttendanceDate != null &&
    input.transferDate <= input.latestAttendanceDate
  )
    throw conflict(
      "TRANSFER_BEFORE_ATTENDANCE",
      `${input.name} has attendance up to ${input.latestAttendanceDate} in their current Project. Choose a later date.`,
      { latestAttendanceDate: input.latestAttendanceDate },
    );
}
