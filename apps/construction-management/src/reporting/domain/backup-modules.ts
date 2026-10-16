import type { MenuKey } from "@/src/shared-kernel/access";

/**
 * The backup module registry (ADR CM-0021 §8, CM-906): what a person can
 * tick on the backup dialogs, the menu whose View allows it, how its
 * amounts are allowed, and the entities (one CSV and JSON each) it holds.
 * The readers behind each entity live in the composition root
 * (`src/composition/backup-sources.ts`), since they read other contexts'
 * tables.
 */

export type BackupModuleScope = "project" | "masters" | "company";

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
  master("masters.issue_categories", "Issue Categories", "issue-categories", [
    "issue_categories",
  ]),
  master("masters.tags", "Tags", "tags", ["tags"]),
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
    ],
    media: false,
  },
];

export const BACKUP_MODULES: readonly BackupModule[] = [
  ...PROJECT_MODULES,
  ...MASTER_MODULES,
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
