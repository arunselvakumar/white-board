import type { MenuKey } from "./access";
import {
  addDays,
  assertCalendarDate,
  daysBetween,
  type CalendarDate,
} from "./calendar-date";
import { DomainError } from "./domain-error";

/**
 * Back-dated Entry policy (CM-113, `modules/12` "Back Dated Entry Control").
 *
 * Decisions (recorded in `modules/12` Open questions 7 and 12):
 * - Days count calendar days in the Company time zone. An entry is
 *   "older than N days" when `today - entryDate > N`; N = 0 means no limit.
 *   Future dates are not this policy's concern.
 * - Override Designations may pass the day limit of the action they are
 *   listed on. The Owner passes every day limit.
 * - The Financial Closing Date is inclusive and blocks everyone, override
 *   Designations and the Owner included. To post into a closed period the
 *   Owner moves the date (an audited settings change).
 * - A module in `global` mode uses the default limits; in `custom` mode its
 *   own. The closing date always applies to every module.
 */

export const BACKDATED_MODULE_GROUPS = [
  { key: "procurement", label: "Procurement" },
  { key: "site", label: "Site" },
  { key: "inventory", label: "Inventory" },
  { key: "accounts", label: "Accounts" },
  { key: "labour_vendor", label: "Labour & Vendor" },
  { key: "sales", label: "Sales" },
  { key: "hrms", label: "HRMS" },
] as const;

export type BackdatedModuleGroup =
  (typeof BACKDATED_MODULE_GROUPS)[number]["key"];

/**
 * The 24 modules a policy can override, in screen order. `entryDateField`
 * names the field of the module's entry that is checked (never
 * `createdAt`); `menu` is the Permission Matrix menu the entries belong to.
 */
export const BACKDATED_MODULES = [
  m(
    "purchase_request",
    "Purchase Request (PR)",
    "procurement",
    "requestDate",
    "procurement.purchase_requests",
  ),
  m(
    "purchase_order",
    "Purchase Order (PO)",
    "procurement",
    "orderDate",
    "procurement.purchase_orders",
  ),
  m(
    "goods_receipt",
    "Goods Receipt Note (GRN)",
    "procurement",
    "receivedDate",
    "procurement.material_received",
  ),
  m(
    "material_transfer",
    "Material Transfer (MT)",
    "procurement",
    "transferDate",
    "procurement.material_transfers",
  ),
  m(
    "material_request",
    "Central Store Material Request (MR)",
    "procurement",
    "requestDate",
    "procurement.material_requests",
  ),
  m(
    "delivery_note",
    "Delivery Note (DN)",
    "procurement",
    "deliveryDate",
    "procurement.delivery_notes",
  ),
  m(
    "daily_worksheet",
    "Daily Worksheet",
    "site",
    "workDate",
    "site_work.daily_worksheet",
  ),
  m(
    "equipment_usage",
    "Equipment Usage",
    "site",
    "usageDate",
    "site_work.equipment_usage",
  ),
  m("issue", "Issues & Snags", "site", "reportedDate", "tracking.issues"),
  m(
    "inspection_request",
    "Inspection Request",
    "site",
    "inspectionDate",
    "tracking.inspection_requests",
  ),
  m(
    "material_testing_report",
    "Material Testing Report",
    "site",
    "testDate",
    "projects.testing_reports",
  ),
  m(
    "current_inventory",
    "Current Inventory",
    "inventory",
    "stockDate",
    "procurement.current_inventory",
  ),
  m(
    "material_consumed",
    "Material Consumed",
    "inventory",
    "consumedDate",
    "procurement.manage_materials",
  ),
  m(
    "missing_material",
    "Missing Material",
    "inventory",
    "reportedDate",
    "procurement.manage_materials",
  ),
  m(
    "petty_cash",
    "Petty Cash",
    "accounts",
    "voucherDate",
    "finance.petty_cash",
  ),
  m(
    "transaction",
    "Transactions",
    "accounts",
    "transactionDate",
    "finance.transactions",
  ),
  m(
    "labour_attendance",
    "Labour Attendance",
    "labour_vendor",
    "attendanceDate",
    "labour.attendance",
  ),
  m(
    "vendor_attendance",
    "Vendor Attendance",
    "labour_vendor",
    "attendanceDate",
    "labour.vendor",
  ),
  m("inquiry", "Inquiry", "sales", "inquiryDate", "sales.inquiries"),
  m(
    "inquiry_follow_up",
    "Inquiry Follow-up",
    "sales",
    "followUpDate",
    "sales.inquiries",
  ),
  m("booking", "Booking", "sales", "bookingDate", "sales.bookings"),
  m(
    "hrms_attendance",
    "Attendance",
    "hrms",
    "attendanceDate",
    "hrms.attendance",
  ),
  m("leave", "Leave", "hrms", "fromDate", "hrms.leaves"),
  m("holiday", "Holiday", "hrms", "holidayDate", "hrms.holidays"),
] as const;

function m<Key extends string>(
  key: Key,
  label: string,
  group: BackdatedModuleGroup,
  entryDateField: string,
  menu: MenuKey,
) {
  return { key, label, group, entryDateField, menu } as const;
}

export type BackdatedModuleKey = (typeof BACKDATED_MODULES)[number]["key"];
export type BackdatedModule = (typeof BACKDATED_MODULES)[number];

const MODULE_KEYS = new Set<string>(BACKDATED_MODULES.map((item) => item.key));

export function isBackdatedModuleKey(
  value: string,
): value is BackdatedModuleKey {
  return MODULE_KEYS.has(value);
}

export function backdatedModule(key: BackdatedModuleKey): BackdatedModule {
  const found = BACKDATED_MODULES.find((item) => item.key === key);
  if (found == null) throw new Error(`Unknown back-dated module ${key}`);
  return found;
}

/** How many days back one action may go, and who may go further. */
export type BackdatedLimit = {
  /** 0 = no restriction. */
  days: number;
  /** Designations allowed past `days`; empty = hard block for everyone but the Owner. */
  overrideDesignationIds: readonly string[];
};

export type BackdatedModuleSetting = {
  mode: "global" | "custom";
  /** Used only in `custom` mode; kept in `global` mode so switching back restores it. */
  create: BackdatedLimit;
  edit: BackdatedLimit;
};

export type BackdatedPolicy = {
  create: BackdatedLimit;
  edit: BackdatedLimit;
  /** Inclusive; entries on or before it are locked for everyone. */
  financialClosingDate: CalendarDate | null;
  /** Every module, in catalogue order. */
  modules: Readonly<Record<BackdatedModuleKey, BackdatedModuleSetting>>;
};

/** Upper bound on days, so a typo cannot store a 5-digit limit. */
export const MAX_BACKDATED_DAYS = 3650;

const NO_LIMIT: BackdatedLimit = { days: 0, overrideDesignationIds: [] };

/** A new Company: no limits, no closing date. */
export const DEFAULT_BACKDATED_POLICY: BackdatedPolicy = {
  create: NO_LIMIT,
  edit: NO_LIMIT,
  financialClosingDate: null,
  modules: Object.fromEntries(
    BACKDATED_MODULES.map((item) => [
      item.key,
      { mode: "global", create: NO_LIMIT, edit: NO_LIMIT },
    ]),
  ) as Record<BackdatedModuleKey, BackdatedModuleSetting>,
};

export type BackdatedLimitInput = {
  days: number;
  overrideDesignationIds?: readonly string[];
};

export type BackdatedPolicyInput = {
  create: BackdatedLimitInput;
  edit: BackdatedLimitInput;
  financialClosingDate?: string | null;
  modules?: readonly {
    key: string;
    mode: "global" | "custom";
    create?: BackdatedLimitInput;
    edit?: BackdatedLimitInput;
  }[];
};

function limitOf(input: BackdatedLimitInput | undefined): BackdatedLimit {
  if (input == null) return NO_LIMIT;
  if (
    !Number.isInteger(input.days) ||
    input.days < 0 ||
    input.days > MAX_BACKDATED_DAYS
  )
    throw new DomainError(
      "BACKDATED_DAYS_INVALID",
      `Days must be a whole number from 0 to ${String(MAX_BACKDATED_DAYS)}.`,
      { details: { days: input.days } },
    );
  return {
    days: input.days,
    overrideDesignationIds: [...new Set(input.overrideDesignationIds ?? [])],
  };
}

/** Validates and normalises a whole policy. Modules not listed stay `global`. */
export function createBackdatedPolicy(
  input: BackdatedPolicyInput,
): BackdatedPolicy {
  const modules = { ...DEFAULT_BACKDATED_POLICY.modules };
  for (const item of input.modules ?? []) {
    if (!isBackdatedModuleKey(item.key))
      throw new DomainError(
        "BACKDATED_MODULE_UNKNOWN",
        `"${item.key}" is not a module with back-dated entry control.`,
        { details: { module: item.key } },
      );
    modules[item.key] = {
      mode: item.mode,
      create: limitOf(item.create),
      edit: limitOf(item.edit),
    };
  }
  const closing = input.financialClosingDate ?? null;
  return {
    create: limitOf(input.create),
    edit: limitOf(input.edit),
    financialClosingDate:
      closing == null
        ? null
        : assertCalendarDate(closing, "FINANCIAL_CLOSING_DATE_INVALID"),
    modules,
  };
}

/** Every Designation id the policy names, for checking they exist. */
export function referencedDesignationIds(policy: BackdatedPolicy): string[] {
  const ids = new Set<string>([
    ...policy.create.overrideDesignationIds,
    ...policy.edit.overrideDesignationIds,
  ]);
  for (const setting of Object.values(policy.modules)) {
    if (setting.mode !== "custom") continue;
    for (const id of setting.create.overrideDesignationIds) ids.add(id);
    for (const id of setting.edit.overrideDesignationIds) ids.add(id);
  }
  return [...ids];
}

/** The limits that apply to one module: its own in `custom` mode, else the defaults. */
export function effectiveLimits(
  policy: BackdatedPolicy,
  module: BackdatedModuleKey,
): { create: BackdatedLimit; edit: BackdatedLimit } {
  const setting = policy.modules[module];
  return setting.mode === "custom"
    ? { create: setting.create, edit: setting.edit }
    : { create: policy.create, edit: policy.edit };
}

/** Who is entering: the Team Member's Designation, and whether they are the Owner. */
export type BackdatedActor = {
  designationId: string | null;
  isOwner: boolean;
};

function limitFor(limit: BackdatedLimit, actor: BackdatedActor): number {
  if (actor.isOwner) return 0;
  if (
    actor.designationId != null &&
    limit.overrideDesignationIds.includes(actor.designationId)
  )
    return 0;
  return limit.days;
}

/**
 * What the screens show one Team Member for one module (`modules/12` rebuild
 * recommendation 6): their resolved day limits (0 = none) and the closing
 * date. The server check stays `assertCanCreate`/`assertCanEdit`.
 */
export function resolveBackdatedLimits(
  policy: BackdatedPolicy,
  module: BackdatedModuleKey,
  actor: BackdatedActor,
): {
  createDays: number;
  editDays: number;
  financialClosingDate: CalendarDate | null;
} {
  const limits = effectiveLimits(policy, module);
  return {
    createDays: limitFor(limits.create, actor),
    editDays: limitFor(limits.edit, actor),
    financialClosingDate: policy.financialClosingDate,
  };
}

function check(
  action: "create" | "edit",
  policy: BackdatedPolicy,
  module: BackdatedModuleKey,
  entryDate: CalendarDate,
  actor: BackdatedActor,
  today: CalendarDate,
): void {
  assertCalendarDate(entryDate, "ENTRY_DATE_INVALID");
  assertCalendarDate(today);
  const closing = policy.financialClosingDate;
  if (closing != null && daysBetween(entryDate, closing) >= 0)
    throw new DomainError(
      "FINANCIAL_PERIOD_CLOSED",
      `The books are closed up to ${closing}. Entries dated on or before it cannot be ${action === "create" ? "created" : "edited"}.`,
      {
        kind: "forbidden",
        details: { module, entryDate, financialClosingDate: closing },
      },
    );
  const limits = effectiveLimits(policy, module);
  const days = limitFor(limits[action], actor);
  if (days === 0) return;
  if (daysBetween(entryDate, today) <= days) return;
  const oldestAllowedDate = addDays(today, -days);
  throw new DomainError(
    action === "create" ? "BACKDATED_CREATE_BLOCKED" : "BACKDATED_EDIT_BLOCKED",
    `${backdatedModule(module).label} entries older than ${String(days)} ${days === 1 ? "day" : "days"} cannot be ${action === "create" ? "created" : "edited"}. The earliest date allowed is ${oldestAllowedDate}.`,
    {
      kind: "forbidden",
      details: { module, entryDate, limitDays: days, oldestAllowedDate },
    },
  );
}

/** Throws unless `actor` may create a `module` entry dated `entryDate` on `today`. */
export function assertCanCreate(
  policy: BackdatedPolicy,
  module: BackdatedModuleKey,
  entryDate: CalendarDate,
  actor: BackdatedActor,
  today: CalendarDate,
): void {
  check("create", policy, module, entryDate, actor, today);
}

/**
 * Throws unless `actor` may edit a `module` entry dated `entryDate` on
 * `today`. Call it with the stored date and, when the edit changes it, the
 * new date too.
 */
export function assertCanEdit(
  policy: BackdatedPolicy,
  module: BackdatedModuleKey,
  entryDate: CalendarDate,
  actor: BackdatedActor,
  today: CalendarDate,
): void {
  check("edit", policy, module, entryDate, actor, today);
}
