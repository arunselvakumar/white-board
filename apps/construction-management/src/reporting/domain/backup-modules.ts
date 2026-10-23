import type { MenuKey } from "@/src/shared-kernel/access";

/**
 * The backup module registry (ADR CM-0021 §8, CM-906): what a person can
 * tick on the backup dialogs, the menu whose View allows it, how its
 * amounts are allowed, and the entities (one CSV and JSON each) it holds.
 * The readers behind each entity live in the composition root
 * (`src/composition/backup-sources.ts`), since they read other contexts'
 * tables.
 */

/**
 * `hrms` modules are Company-level and in no Project; a full Company
 * backup holds them, and the Owner can back up HRMS alone from Settings →
 * Backup & export.
 */
export type BackupModuleScope = "project" | "masters" | "hrms" | "company";

/**
 * Who sees a module's amounts: Financial on `menu`, or (finance menus,
 * which carry no Financial, CM-0017 §14) View on it. Null: no amounts.
 */
export type BackupMoneyRule = {
  menu: MenuKey;
  flag: "financial" | "read";
} | null;

export type BackupModule = {
  key: string;
  label: string;
  /** The dialog groups modules under these headings. */
  group: string;
  scope: BackupModuleScope;
  /** View on this menu allows it; null for Company settings (Owner only). */
  menu: MenuKey | null;
  money: BackupMoneyRule;
  /** Folder in the ZIP, for its CSVs and under `media/`. */
  folder: string;
  /** Entity keys, in file order; each is one CSV and one JSON. */
  entities: readonly string[];
  /** Whether "Media" adds its stored files. */
  media: boolean;
  /**
   * The module's lists hide others' rows without View all, and its backup
   * exports every row: so it needs View all as well as View (CM-1008).
   */
  viewAll?: true;
};

const PROJECT_MODULES: readonly BackupModule[] = [
  {
    key: "projects.project",
    label: "Project details",
    group: "Project",
    scope: "project",
    menu: "projects.project",
    money: { menu: "projects.project", flag: "financial" },
    folder: "project",
    entities: ["projects", "project_custom_fields", "project_locations"],
    media: false,
  },
  {
    key: "site_work.daily_worksheet",
    label: "Daily Worksheets",
    group: "Daily Work",
    scope: "project",
    menu: "site_work.daily_worksheet",
    money: null,
    folder: "daily-worksheets",
    entities: ["worksheets", "worksheet_materials"],
    media: true,
  },
  {
    key: "site_work.equipment_usage",
    label: "Equipment Usage",
    group: "Daily Work",
    scope: "project",
    menu: "site_work.equipment_usage",
    money: { menu: "site_work.equipment_usage", flag: "financial" },
    folder: "equipment-usage",
    entities: ["equipment_usage_sheets", "equipment_usage_materials"],
    media: true,
  },
  {
    key: "site_work.site_diary",
    label: "Site Diary",
    group: "Daily Work",
    scope: "project",
    menu: "site_work.site_diary",
    money: null,
    folder: "site-diary",
    entities: [
      "site_diaries",
      "site_diary_visitors",
      "site_diary_instructions",
    ],
    media: true,
  },
  {
    key: "site_work.hindrances",
    label: "Hindrance Register",
    group: "Daily Work",
    scope: "project",
    menu: "site_work.hindrances",
    money: null,
    folder: "hindrances",
    entities: ["hindrances"],
    media: true,
  },
  {
    key: "procurement.purchase_requests",
    label: "Purchase Requests",
    group: "Materials",
    scope: "project",
    menu: "procurement.purchase_requests",
    money: null,
    folder: "purchase-requests",
    entities: ["purchase_requests", "purchase_request_items"],
    media: true,
  },
  {
    key: "procurement.purchase_orders",
    label: "Purchase Orders",
    group: "Materials",
    scope: "project",
    menu: "procurement.purchase_orders",
    money: { menu: "procurement.purchase_orders", flag: "read" },
    folder: "purchase-orders",
    entities: ["purchase_orders", "purchase_order_items"],
    media: true,
  },
  {
    key: "procurement.material_received",
    label: "Material Received",
    group: "Materials",
    scope: "project",
    menu: "procurement.material_received",
    money: { menu: "procurement.material_received", flag: "financial" },
    folder: "material-received",
    entities: ["goods_receipts", "goods_receipt_items"],
    media: true,
  },
  {
    key: "procurement.material_transfers",
    label: "Material Transfers",
    group: "Materials",
    scope: "project",
    menu: "procurement.material_transfers",
    money: null,
    folder: "material-transfers",
    entities: ["material_transfers", "material_transfer_items"],
    media: true,
  },
  {
    key: "procurement.current_inventory",
    label: "Stock",
    group: "Materials",
    scope: "project",
    menu: "procurement.current_inventory",
    money: null,
    folder: "stock",
    entities: ["stock_entries", "stock_consumption"],
    media: false,
  },
  {
    key: "labour.attendance",
    label: "Labour Attendance",
    group: "Labour",
    scope: "project",
    menu: "labour.attendance",
    money: { menu: "labour.labour", flag: "financial" },
    folder: "labour-attendance",
    entities: ["labour_attendance"],
    media: false,
  },
  {
    key: "labour.labour",
    label: "Labour Payments",
    group: "Labour",
    scope: "project",
    menu: "labour.labour",
    money: { menu: "labour.labour", flag: "financial" },
    folder: "labour-payments",
    entities: ["labour_payments"],
    media: true,
  },
  {
    key: "labour.vendor",
    label: "Vendor Attendance",
    group: "Labour",
    scope: "project",
    menu: "labour.vendor",
    money: { menu: "labour.vendor", flag: "financial" },
    folder: "vendor-attendance",
    entities: ["vendor_attendance", "vendor_attendance_lines"],
    media: false,
  },
  {
    key: "finance.transactions",
    label: "Transactions",
    group: "Payment & Accounting",
    scope: "project",
    menu: "finance.transactions",
    money: { menu: "finance.transactions", flag: "read" },
    folder: "transactions",
    entities: ["transactions", "account_transfers"],
    media: true,
  },
  {
    key: "finance.petty_cash",
    label: "Petty Cash",
    group: "Payment & Accounting",
    scope: "project",
    menu: "finance.petty_cash",
    money: { menu: "finance.petty_cash", flag: "read" },
    folder: "petty-cash",
    entities: ["petty_cash_vouchers"],
    media: true,
  },
  {
    key: "finance.parties",
    label: "Party invoices and payments",
    group: "Payment & Accounting",
    scope: "project",
    menu: "finance.parties",
    money: { menu: "finance.parties", flag: "read" },
    folder: "parties",
    entities: ["party_invoices", "party_payments"],
    media: true,
  },
  {
    key: "finance.other_expenses",
    label: "Other Expenses",
    group: "Payment & Accounting",
    scope: "project",
    menu: "finance.other_expenses",
    money: { menu: "finance.other_expenses", flag: "read" },
    folder: "other-expenses",
    entities: ["other_expenses"],
    media: true,
  },
  {
    key: "tracking.tasks",
    label: "Tasks",
    group: "Tracking",
    scope: "project",
    menu: "tracking.tasks",
    money: { menu: "tracking.tasks", flag: "financial" },
    folder: "tasks",
    entities: ["tasks", "task_progress"],
    media: true,
  },
  {
    key: "tracking.issues",
    label: "Issues and snags",
    group: "Tracking",
    scope: "project",
    menu: "tracking.issues",
    money: null,
    folder: "issues",
    entities: ["issues", "issue_updates"],
    media: true,
  },
  {
    key: "tracking.inspection_requests",
    label: "Inspection Requests",
    group: "Tracking",
    scope: "project",
    menu: "tracking.inspection_requests",
    money: null,
    folder: "inspections",
    entities: ["inspections", "inspection_observations"],
    media: true,
  },
  {
    key: "projects.drawings",
    label: "Project Drawings",
    group: "Project files",
    scope: "project",
    menu: "projects.drawings",
    money: null,
    folder: "drawings",
    entities: ["drawings", "drawing_revisions"],
    media: true,
  },
  {
    key: "projects.testing_reports",
    label: "Testing Reports",
    group: "Project files",
    scope: "project",
    menu: "projects.testing_reports",
    money: null,
    folder: "testing-reports",
    entities: ["testing_reports"],
    media: true,
  },
  {
    key: "projects.gallery",
    label: "Gallery",
    group: "Project files",
    scope: "project",
    menu: "projects.gallery",
    money: null,
    folder: "gallery",
    entities: ["gallery"],
    media: true,
  },
  // Sales (CM-1008, ADR CM-0022 §11): bookings with their status history
  // and the units' sales details; the Booking Form and photos as media.
  {
    key: "sales.bookings",
    label: "Bookings",
    group: "Sales",
    scope: "project",
    menu: "sales.bookings",
    money: null,
    folder: "bookings",
    entities: ["bookings", "booking_events", "unit_profiles"],
    media: true,
  },
  // Inquiries with their history, follow-ups and tasks; the Visiting Card
  // and photos as media (CM-1008).
  {
    key: "sales.inquiries",
    label: "Inquiries",
    group: "Sales",
    scope: "project",
    menu: "sales.inquiries",
    money: null,
    folder: "inquiries",
    entities: ["inquiries", "inquiry_events", "follow_ups", "inquiry_tasks"],
    media: true,
    viewAll: true,
  },
  // Contracts & Billing (CM-1111, ADR CM-0023): each side's bills with
  // their abstract, deductions, advances, guarantees, retention releases
  // and escalation clauses; measurement photos as media.
  {
    key: "contracts.boq",
    label: "BOQ and Variations",
    group: "Contracts",
    scope: "project",
    menu: "contracts.boq",
    money: { menu: "contracts.boq", flag: "financial" },
    folder: "boq",
    entities: [
      "client_contract_terms",
      "boq_sections",
      "boq_items",
      "variations",
    ],
    media: false,
  },
  {
    key: "contracts.work_orders",
    label: "Work Orders",
    group: "Contracts",
    scope: "project",
    menu: "contracts.work_orders",
    money: { menu: "contracts.work_orders", flag: "financial" },
    folder: "work-orders",
    entities: [
      "work_orders",
      "work_order_lines",
      "work_order_materials",
      "work_order_revisions",
    ],
    media: false,
  },
  {
    key: "contracts.measurements",
    label: "Measurement Book",
    group: "Contracts",
    scope: "project",
    menu: "contracts.measurements",
    money: null,
    folder: "measurement-book",
    entities: ["measurement_sheets", "measurement_rows"],
    media: true,
  },
  {
    key: "contracts.contractor_bills",
    label: "Contractor Bills",
    group: "Contracts",
    scope: "project",
    menu: "contracts.contractor_bills",
    money: { menu: "contracts.contractor_bills", flag: "financial" },
    folder: "contractor-bills",
    entities: [
      "contractor_bills",
      "contractor_bill_lines",
      "contractor_bill_deductions",
      "contractor_advances",
      "contractor_bank_guarantees",
      "contractor_retention_releases",
      "contractor_escalation_clauses",
      "contractor_escalation_components",
    ],
    media: false,
  },
  {
    key: "contracts.client_bills",
    label: "Client Bills",
    group: "Contracts",
    scope: "project",
    menu: "contracts.client_bills",
    money: { menu: "contracts.client_bills", flag: "financial" },
    folder: "client-bills",
    entities: [
      "client_bills",
      "client_bill_lines",
      "client_bill_deductions",
      "client_advances",
      "client_bank_guarantees",
      "client_retention_releases",
      "client_escalation_clauses",
      "client_escalation_components",
    ],
    media: false,
  },
];

function master(
  key: MenuKey,
  label: string,
  folder: string,
  entities: readonly string[],
  money: BackupMoneyRule = null,
): BackupModule {
  return {
    key,
    label,
    group: "Master records",
    scope: "masters",
    menu: key,
    money,
    folder: `masters/${folder}`,
    entities,
    media: false,
  };
}

const MASTER_MODULES: readonly BackupModule[] = [
  master("organization.team_members", "Team Members", "team-members", [
    "team_members",
  ]),
  master("organization.designations", "Designations", "designations", [
    "designations",
  ]),
  master("masters.departments", "Departments", "departments", ["departments"]),
  master("masters.contractors", "Contractors", "contractors", ["contractors"]),
  master("masters.suppliers", "Suppliers", "suppliers", ["suppliers"]),
  master("masters.vendors", "Vendors", "vendors", ["vendors"]),
  master("masters.labours", "Labours", "labours", ["labours"], {
    menu: "masters.labours",
    flag: "financial",
  }),
  master(
    "masters.labour_categories",
    "Labour Categories",
    "labour-categories",
    ["labour_categories"],
  ),
  master("masters.equipments", "Equipments", "equipments", ["equipments"], {
    menu: "masters.equipments",
    flag: "financial",
  }),
  master(
    "masters.material_categories",
    "Material Categories",
    "material-categories",
    ["material_categories"],
  ),
  master("masters.materials", "Materials", "materials", ["materials"], {
    menu: "masters.materials",
    flag: "financial",
  }),
  master("masters.units", "Measurement Units", "units", ["measurement_units"]),
  master("masters.work_types", "Work Types", "work-types", ["work_types"]),
  master("masters.terms_conditions", "Terms & Conditions", "terms-conditions", [
    "terms_conditions",
  ]),
  master("masters.bank_accounts", "Company's Bank A/C", "bank-accounts", [
    "bank_accounts",
  ]),
  master(
    "masters.payment_categories",
    "Payment Categories",
    "payment-categories",
    ["payment_categories"],
  ),
  master("masters.other_parties", "Other Parties", "other-parties", [
    "other_parties",
  ]),
  master("masters.clients", "Clients", "clients", ["clients"]),
  master("masters.issue_categories", "Issue Categories", "issue-categories", [
    "issue_categories",
  ]),
  master("masters.tags", "Tags", "tags", ["tags"]),
  // The Item Library with its rate analysis, and the price indices it
  // keeps (CM-1111); the library shows rates to whoever views it.
  master(
    "contracts.items",
    "Item Library",
    "item-library",
    ["contract_items", "contract_item_analysis_lines", "price_indices"],
    { menu: "contracts.items", flag: "read" },
  ),
];

function hrms(
  key: MenuKey,
  label: string,
  folder: string,
  entities: readonly string[],
  money: BackupMoneyRule = null,
): BackupModule {
  return {
    key,
    label,
    group: "HRMS",
    scope: "hrms",
    menu: key,
    money,
    folder: `hrms/${folder}`,
    entities,
    media: false,
  };
}

const HRMS_MODULES: readonly BackupModule[] = [
  hrms("hrms.employees", "Employees (HR data)", "employees", [
    "hrms_employees",
    "hrms_branches",
    "hrms_settings",
  ]),
  hrms("hrms.shifts", "Shifts and assignments", "shifts", [
    "hrms_shift_templates",
    "hrms_rotation_templates",
    "hrms_shift_assignments",
  ]),
  hrms("hrms.holidays", "Holidays", "holidays", ["hrms_holidays"]),
  hrms("hrms.attendance", "Staff attendance", "attendance", [
    "hrms_attendance_entries",
  ]),
  hrms("hrms.leaves", "Leave", "leave", [
    "hrms_leave_types",
    "hrms_leave_balances",
    "hrms_leave_ledger",
    "hrms_leave_requests",
  ]),
  hrms(
    "hrms.salaries",
    "Salary",
    "salary",
    [
      "hrms_salary_structures",
      "hrms_salary_components",
      "hrms_employee_salary_configs",
      "hrms_salary_slips",
      "hrms_salary_payments",
    ],
    { menu: "hrms.salaries", flag: "financial" },
  ),
];

const COMPANY_MODULES: readonly BackupModule[] = [
  {
    key: "company.settings",
    label: "Company profile and settings",
    group: "Company",
    scope: "company",
    menu: null,
    money: null,
    folder: "company",
    entities: [
      "company_profile",
      "billing_addresses",
      "sequence_rules",
      "backdated_entry_policy",
      "stores",
      "contracts_settings",
    ],
    media: false,
  },
];

export const BACKUP_MODULES: readonly BackupModule[] = [
  ...PROJECT_MODULES,
  ...MASTER_MODULES,
  ...HRMS_MODULES,
  ...COMPANY_MODULES,
];

const BY_KEY = new Map(BACKUP_MODULES.map((module) => [module.key, module]));

export function backupModule(key: string): BackupModule | null {
  return BY_KEY.get(key) ?? null;
}

export function backupModulesIn(
  scope: BackupModuleScope,
): readonly BackupModule[] {
  return BACKUP_MODULES.filter((module) => module.scope === scope);
}

/** Every module a full Company backup holds, in file order. */
export const COMPANY_BACKUP_MODULES: readonly string[] = BACKUP_MODULES.map(
  (module) => module.key,
);

/** Every entity key the registry names. */
export const BACKUP_ENTITY_KEYS: readonly string[] = BACKUP_MODULES.flatMap(
  (module) => module.entities,
);

/** A Company-scope backup of HRMS modules alone (not the full backup). */
export function isHrmsOnly(modules: readonly string[]): boolean {
  return (
    modules.length > 0 &&
    modules.length < BACKUP_MODULES.length &&
    modules.every((key) => backupModule(key)?.scope === "hrms")
  );
}
