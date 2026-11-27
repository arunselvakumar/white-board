import { normalizeMobile } from "@repo/auth/construction/mobile";

import {
  isCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError, conflict } from "@/src/shared-kernel/domain-error";
import {
  isValidAadhaar,
  isValidPan,
  maskIdentifier,
  normalizeAadhaar,
} from "@/src/shared-kernel/tax-ids";

import { MAX_PAISE } from "./ledger";
import {
  DEFAULT_WORKING_HOURS,
  workingHours,
  type WageType,
  type Weekday,
} from "./wages";

export type Gender = "male" | "female" | "other";

export const GENDERS: readonly Gender[] = ["male", "female", "other"];
export const WAGE_TYPES: readonly WageType[] = ["daily", "monthly"];

export const BLOOD_GROUPS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
] as const;

export type BloodGroup = (typeof BLOOD_GROUPS)[number];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * An Employee's record (ADR CM-0055 §1): everything a Labour or a Site
 * Engineer had. Amounts are integer paise; the wage of the other wage type
 * is always null. Aadhaar, PAN and the bank account number are plain in
 * memory and stored encrypted.
 */
export type EmployeeDetails = {
  name: string;
  /** The Company's own "Employee Id"; unique among live Employees. */
  employeeCode: string | null;
  /** A live Role of the Company (ADR CM-0055 §2); the Department is the Role's. */
  roleId: string;
  fatherName: string | null;
  dateOfBirth: CalendarDate | null;
  gender: Gender | null;
  bloodGroup: BloodGroup | null;
  joiningDate: CalendarDate;
  /** E.164. Required to sign in: it is their login (ADR CM-0053). */
  mobile: string | null;
  /** Lower-cased. */
  email: string | null;
  address: string | null;
  emergencyContact: string | null;
  /** B.E. Civil, Diploma in Civil Engineering … */
  qualification: string | null;
  /** Whole years in the trade before joining, 0 to 60. */
  experienceYears: number | null;
  /** Civil, steel / PEB, MEP …; free text. */
  specialisation: string | null;
  wageType: WageType;
  wagePerDay: number | null;
  wagePerMonth: number | null;
  overtimeWagePerHour: number;
  /**
   * Decimal hours a day (ADR CM-0011); time worked beyond it is overtime.
   * Default 8.
   */
  workingHoursPerDay: string;
  /** 0 = Sunday … 6 = Saturday, sorted, unique. */
  weeklyHolidays: Weekday[];
  /** EPFO UAN, 12 digits. */
  uanNumber: string | null;
  /** ESIC insurance number, 10 or 17 digits. */
  esicNumber: string | null;
  aadhaar: string | null;
  /** Upper-cased. */
  pan: string | null;
  bankAccountHolder: string | null;
  /** Letters and digits, upper-cased. */
  bankAccountNumber: string | null;
  /** Four letters, a zero, six letters or digits. */
  bankIfsc: string | null;
  bankName: string | null;
  labourCategoryId: string | null;
  /** Another Employee of the Company (ADR CM-0035); optional. */
  reportsToId: string | null;
};

export type EmployeeDetailsInput = {
  name: string;
  employeeCode?: string | null;
  roleId: string;
  fatherName?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  bloodGroup?: string | null;
  joiningDate: string;
  mobile?: string | null;
  email?: string | null;
  address?: string | null;
  emergencyContact?: string | null;
  qualification?: string | null;
  experienceYears?: number | null;
  specialisation?: string | null;
  wageType: string;
  wagePerDay?: number | null;
  wagePerMonth?: number | null;
  overtimeWagePerHour: number | null;
  /** Leave out (or null) for 8. */
  workingHoursPerDay?: string | number | null;
  weeklyHolidays?: readonly number[] | null;
  uanNumber?: string | null;
  esicNumber?: string | null;
  aadhaar?: string | null;
  pan?: string | null;
  bankAccountHolder?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  bankName?: string | null;
  labourCategoryId?: string | null;
  reportsToId?: string | null;
};

/** One problem with one field, for forms and the Excel import preview. */
export type FieldProblem = {
  field: keyof EmployeeDetailsInput | "openingBalance" | "projectIds";
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
 * shows them per row). `employeeDetails` throws the first. `today` (the
 * Company's) bounds the date of birth.
 */
export function checkEmployeeDetails(
  input: EmployeeDetailsInput,
  today: CalendarDate,
): { details: EmployeeDetails; problems: [] } | { problems: FieldProblem[] } {
  const problems: FieldProblem[] = [];
  const problem = (
    field: FieldProblem["field"],
    code: string,
    message: string,
  ) => {
    problems.push({ field, code, message });
  };
  const text = (
    field: FieldProblem["field"],
    value: string | null | undefined,
    max: number,
    code: string,
    label: string,
  ): string | null => {
    const tidy = optional(value);
    if (tidy != null && tidy.length > max) {
      problem(
        field,
        code,
        `${label} must be at most ${String(max)} characters.`,
      );
      return null;
    }
    return tidy;
  };

  const name = optional(input.name) ?? "";
  if (name.length === 0)
    problem("name", "EMPLOYEE_NAME_REQUIRED", "Enter the Employee's name.");
  else if (name.length > 100)
    problem(
      "name",
      "EMPLOYEE_NAME_TOO_LONG",
      "Name must be at most 100 characters.",
    );

  const employeeCode = text(
    "employeeCode",
    input.employeeCode,
    30,
    "EMPLOYEE_CODE_TOO_LONG",
    "Employee Id",
  );

  const roleId = input.roleId.trim();
  if (roleId === "")
    problem("roleId", "EMPLOYEE_ROLE_REQUIRED", "Choose the Employee's Role.");

  const fatherName = text(
    "fatherName",
    input.fatherName,
    100,
    "FATHER_NAME_TOO_LONG",
    "Father's name",
  );

  const joiningDate = input.joiningDate.trim();
  const joiningValid = isCalendarDate(joiningDate);
  if (!joiningValid)
    problem(
      "joiningDate",
      "JOINING_DATE_INVALID",
      "Enter the joining date (YYYY-MM-DD).",
    );

  const birth = input.dateOfBirth?.trim() ?? "";
  let dateOfBirth: CalendarDate | null = null;
  if (birth !== "") {
    if (!isCalendarDate(birth) || birth >= today)
      problem(
        "dateOfBirth",
        "DATE_OF_BIRTH_INVALID",
        "Enter the date of birth: a real date before today.",
      );
    else if (joiningValid && joiningDate <= birth)
      problem(
        "joiningDate",
        "JOINING_DATE_INVALID",
        "The joining date must be after the date of birth.",
      );
    else dateOfBirth = birth;
  }

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

  let hoursPerDay = DEFAULT_WORKING_HOURS;
  const rawHours = input.workingHoursPerDay;
  if (rawHours != null && String(rawHours).trim() !== "")
    try {
      hoursPerDay = workingHours(rawHours);
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      problem("workingHoursPerDay", error.code, error.message);
    }

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

  const pan = optional(input.pan)?.replace(/\s/g, "").toUpperCase() ?? null;
  if (pan != null && !isValidPan(pan))
    problem("pan", "PAN_INVALID", "Enter a valid 10-character PAN.");

  const mobileRaw = optional(input.mobile);
  const mobile = mobileRaw == null ? null : normalizeMobile(mobileRaw);
  if (mobileRaw != null && mobile == null)
    problem("mobile", "MOBILE_INVALID", "Enter a valid mobile number.");

  const email = optional(input.email)?.toLowerCase() ?? null;
  if (email != null && (email.length > 254 || !EMAIL.test(email)))
    problem("email", "EMAIL_INVALID", "Enter a valid email address.");

  const address = text(
    "address",
    input.address,
    500,
    "ADDRESS_TOO_LONG",
    "Address",
  );
  const emergencyContact = text(
    "emergencyContact",
    input.emergencyContact,
    120,
    "EMERGENCY_CONTACT_TOO_LONG",
    "Emergency contact",
  );
  const qualification = text(
    "qualification",
    input.qualification,
    100,
    "QUALIFICATION_TOO_LONG",
    "Qualification",
  );
  const specialisation = text(
    "specialisation",
    input.specialisation,
    100,
    "SPECIALISATION_TOO_LONG",
    "Specialisation",
  );

  const experience = input.experienceYears ?? null;
  if (
    experience != null &&
    (!Number.isInteger(experience) || experience < 0 || experience > 60)
  )
    problem(
      "experienceYears",
      "EXPERIENCE_INVALID",
      "Experience is a whole number of years, 0 to 60.",
    );

  const gender = optional(input.gender)?.toLowerCase() as Gender | null;
  if (gender != null && !GENDERS.includes(gender))
    problem("gender", "GENDER_INVALID", "Choose Male, Female or Other.");

  const bloodGroup = (optional(input.bloodGroup)?.toUpperCase() ??
    null) as BloodGroup | null;
  if (bloodGroup != null && !BLOOD_GROUPS.includes(bloodGroup))
    problem(
      "bloodGroup",
      "BLOOD_GROUP_INVALID",
      "Choose a blood group like A+ or O-.",
    );

  const accountNumber =
    input.bankAccountNumber?.replace(/[\s-]/g, "").toUpperCase() ?? "";
  if (accountNumber !== "" && !/^[A-Z0-9]{6,30}$/.test(accountNumber))
    problem(
      "bankAccountNumber",
      "ACCOUNT_NUMBER_INVALID",
      "Enter the account number: 6 to 30 letters and digits.",
    );
  const bankIfsc = optional(input.bankIfsc)?.toUpperCase() ?? null;
  if (bankIfsc != null && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bankIfsc))
    problem(
      "bankIfsc",
      "IFSC_INVALID",
      "An IFSC is four letters, a zero, then six letters or digits (like HDFC0001234).",
    );
  const bankAccountHolder = text(
    "bankAccountHolder",
    input.bankAccountHolder,
    100,
    "ACCOUNT_HOLDER_TOO_LONG",
    "Account holder",
  );
  const bankName = text(
    "bankName",
    input.bankName,
    100,
    "BANK_NAME_TOO_LONG",
    "Bank name",
  );

  if (problems.length > 0) return { problems };
  return {
    problems: [],
    details: {
      name,
      employeeCode,
      roleId,
      fatherName,
      dateOfBirth,
      gender,
      bloodGroup,
      joiningDate,
      mobile,
      email,
      address,
      emergencyContact,
      qualification,
      experienceYears: experience,
      specialisation,
      wageType,
      wagePerDay: wageType === "daily" ? (wage ?? null) : null,
      wagePerMonth: wageType === "monthly" ? (wage ?? null) : null,
      overtimeWagePerHour: overtime ?? 0,
      workingHoursPerDay: hoursPerDay,
      weeklyHolidays: holidays.sort((a, b) => a - b) as Weekday[],
      uanNumber,
      esicNumber,
      aadhaar,
      pan,
      bankAccountHolder,
      bankAccountNumber: accountNumber === "" ? null : accountNumber,
      bankIfsc,
      bankName,
      labourCategoryId: optional(input.labourCategoryId),
      reportsToId: optional(input.reportsToId),
    },
  };
}

/** Validates and tidies an Employee's details; throws the first problem. */
export function employeeDetails(
  input: EmployeeDetailsInput,
  today: CalendarDate,
): EmployeeDetails {
  const checked = checkEmployeeDetails(input, today);
  const [first] = checked.problems;
  if (first != null)
    throw new DomainError(first.code, first.message, {
      details: { field: first.field },
    });
  if (!("details" in checked)) throw new Error("unreachable");
  return checked.details;
}

/**
 * Opening balance in paise, signed: positive is owed to the Employee, a
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

/** The last four characters, kept beside the ciphertext for masking. */
export function last4(value: string | null): string | null {
  return value == null ? null : value.slice(-4);
}

/** Each Project once, blanks dropped, in the order given. */
export function uniqueProjectIds(projectIds: readonly string[]): string[] {
  return [...new Set(projectIds.map((id) => id.trim()).filter(Boolean))];
}

export type EmployeeProps = {
  id: string;
  workspaceId: string;
  details: EmployeeDetails;
  /**
   * The Projects they work on now (ADR CM-0033): none, one or many. Changed
   * on Add and Edit Employee, from a Project's Teams and by a transfer.
   */
  projectIds: readonly string[];
  /**
   * Their sign-in membership (organization context id), kept off Office
   * Staff; null when they do not sign in (ADR CM-0055 §4).
   */
  teamMemberId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  deletedAt: Date | null;
};

/** What ticking and unticking Projects on Edit Employee changed. */
export type ProjectChanges = { added: string[]; removed: string[] };

/**
 * A person the Company employs (ADR CM-0055): a record, not a User, though
 * they may sign in. The opening balance is a ledger entry, not a field
 * (ADR CM-0004).
 */
export class Employee {
  private constructor(private props: EmployeeProps) {}

  /** Projects are optional: they can be ticked later (ADR CM-0033). */
  static create(input: {
    id: string;
    workspaceId: string;
    details: EmployeeDetails;
    projectIds?: readonly string[];
    by: string;
    now: Date;
  }): Employee {
    return new Employee({
      id: input.id,
      workspaceId: input.workspaceId,
      details: input.details,
      projectIds: uniqueProjectIds(input.projectIds ?? []),
      teamMemberId: null,
      isActive: true,
      createdAt: input.now,
      updatedAt: input.now,
      createdBy: input.by,
      updatedBy: input.by,
      deletedAt: null,
    });
  }

  static reconstitute(props: EmployeeProps): Employee {
    return new Employee({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get workspaceId(): string {
    return this.props.workspaceId;
  }
  get details(): EmployeeDetails {
    return this.props.details;
  }
  get projectIds(): readonly string[] {
    return this.props.projectIds;
  }
  get teamMemberId(): string | null {
    return this.props.teamMemberId;
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

  isOn(projectId: string): boolean {
    return this.props.projectIds.includes(projectId);
  }

  private touch(by: string, now: Date): void {
    this.props.updatedAt = now;
    this.props.updatedBy = by;
  }

  private assertLive(): void {
    if (this.props.deletedAt != null)
      throw new DomainError(
        "EMPLOYEE_NOT_FOUND",
        "This Employee was deleted.",
        {
          kind: "not_found",
        },
      );
  }

  update(details: EmployeeDetails, by: string, now: Date): void {
    this.assertLive();
    this.props.details = details;
    this.touch(by, now);
  }

  /** Their sign-in membership, or null when they no longer sign in. */
  setSignIn(teamMemberId: string | null, by: string, now: Date): void {
    this.assertLive();
    if (this.props.teamMemberId === teamMemberId) return;
    this.props.teamMemberId = teamMemberId;
    this.touch(by, now);
  }

  /**
   * Ticks and unticks Projects on Edit Employee (ADR CM-0033). Returns what
   * changed, for the history.
   */
  setProjects(
    projectIds: readonly string[],
    by: string,
    now: Date,
  ): ProjectChanges {
    this.assertLive();
    const wanted = uniqueProjectIds(projectIds);
    const added = wanted.filter((id) => !this.isOn(id));
    const removed = this.props.projectIds.filter((id) => !wanted.includes(id));
    if (added.length === 0 && removed.length === 0) return { added, removed };
    this.props.projectIds = [
      ...this.props.projectIds.filter((id) => wanted.includes(id)),
      ...added,
    ];
    this.touch(by, now);
    return { added, removed };
  }

  /**
   * Moves the Employee from one of their Projects to another (CM-206). The
   * balance belongs to the Employee and moves with them; the date rules are
   * checked by the command against attendance and history.
   */
  transfer(
    fromProjectId: string,
    toProjectId: string,
    by: string,
    now: Date,
  ): void {
    this.assertLive();
    if (!this.isOn(fromProjectId))
      throw conflict(
        "EMPLOYEE_NOT_ON_PROJECT",
        `${this.props.details.name} does not work on the Project they would leave.`,
        { employeeId: this.props.id },
      );
    if (fromProjectId === toProjectId || this.isOn(toProjectId))
      throw conflict(
        "TRANSFER_SAME_PROJECT",
        `${this.props.details.name} already works on this Project. Choose another Project.`,
        { employeeId: this.props.id },
      );
    this.props.projectIds = this.props.projectIds.map((id) =>
      id === fromProjectId ? toProjectId : id,
    );
    this.touch(by, now);
  }

  /**
   * Onto one more Project from the Project's Teams (ADR CM-0038 §2,
   * CM-0055 §5); their other Projects stay. Only an active Employee is added.
   */
  joinProject(projectId: string, by: string, now: Date): void {
    this.assertLive();
    if (!this.props.isActive)
      throw new DomainError(
        "EMPLOYEE_INACTIVE",
        `${this.props.details.name} is inactive. Mark them active before adding them to a Project.`,
        { details: { employeeId: this.props.id } },
      );
    if (this.isOn(projectId))
      throw conflict(
        "EMPLOYEE_ALREADY_ON_PROJECT",
        `${this.props.details.name} is already on this Project.`,
        { employeeId: this.props.id },
      );
    this.props.projectIds = [...this.props.projectIds, projectId];
    this.touch(by, now);
  }

  /** Off one Project from the Project's Teams; their others stay. */
  leaveProject(projectId: string, by: string, now: Date): void {
    this.assertLive();
    if (!this.isOn(projectId))
      throw conflict(
        "EMPLOYEE_NOT_ON_PROJECT",
        `${this.props.details.name} is not on this Project.`,
        { employeeId: this.props.id },
      );
    this.props.projectIds = this.props.projectIds.filter(
      (id) => id !== projectId,
    );
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

  delete(by: string, now: Date): void {
    this.assertLive();
    this.props.deletedAt = now;
    this.touch(by, now);
  }
}

/**
 * The transfer date rules (CM-206): on or after the Employee's last
 * history row (the first is the joining date), and after every day they
 * were marked in attendance on the Project they leave, since attendance
 * there stops on the transfer date.
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
      `${input.name}'s Projects last changed on ${input.lastTransferDate}. Choose that date or later.`,
      { lastTransferDate: input.lastTransferDate },
    );
  if (
    input.latestAttendanceDate != null &&
    input.transferDate <= input.latestAttendanceDate
  )
    throw conflict(
      "TRANSFER_BEFORE_ATTENDANCE",
      `${input.name} has attendance up to ${input.latestAttendanceDate} on the Project they leave. Choose a later date.`,
      { latestAttendanceDate: input.latestAttendanceDate },
    );
}
