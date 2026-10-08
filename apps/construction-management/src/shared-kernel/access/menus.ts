import { maskFromLetters } from "./flags";

/** Permission Matrix categories, in the order the matrix shows them. */
export const MENU_CATEGORIES = [
  { key: "project_management", label: "Project Management" },
  { key: "payment_accounting", label: "Payment & Accounting" },
  { key: "materials", label: "Materials" },
  { key: "master_records", label: "Master records" },
  { key: "central_store", label: "Central store" },
  { key: "hrms", label: "HRMS" },
  { key: "others", label: "Others" },
] as const;

export type MenuCategory = (typeof MENU_CATEGORIES)[number]["key"];

type MenuDefinition = {
  /** `<context>.<menu>`; stable, stored in grants. */
  key: string;
  label: string;
  category: MenuCategory;
  /** The flags this menu supports, as flag letters (`CRUDAPNO`). */
  letters: string;
  /** Project-level menus also need the Team Member on the Project. */
  projectScoped: boolean;
};

/**
 * Every menu of the Permission Matrix (`modules/01` "Full menu matrix"), keyed by
 * the context that will own it (ADR CM-0003). Only these cells can be
 * granted; the UI reads the same list.
 */
const DEFINITIONS = [
  // Project Management: project-level menus.
  ["projects.project", "Project", "project_management", "CRUDF", true],
  ["projects.wings", "Create Wing", "project_management", "CRUD", true],
  [
    "site_work.daily_worksheet",
    "Daily Worksheet",
    "project_management",
    "CRUDAPNO",
    true,
  ],
  [
    "projects.drawings",
    "Project Drawings",
    "project_management",
    "CRUDN",
    true,
  ],
  [
    "projects.testing_reports",
    "Testing Reports",
    "project_management",
    "CRUD",
    true,
  ],
  ["tracking.tasks", "Task", "project_management", "CRUDAJPNVOF", true],
  [
    "tracking.issues",
    "Issues and snags",
    "project_management",
    "CRUDAJPNVO",
    true,
  ],
  [
    "tracking.inspection_requests",
    "Inspection Request",
    "project_management",
    "CRUDAJPNO",
    true,
  ],
  ["reporting.project_reports", "Reports", "project_management", "RP", true],
  ["labour.attendance", "Attendance", "project_management", "CRUDPO", true],
  ["labour.labour", "Labour", "project_management", "CRUDPTOF", true],
  ["labour.vendor", "Vendor", "project_management", "CRUDPOF", true],
  ["sales.bookings", "Booking Details", "project_management", "CRUDPNO", true],
  ["sales.inquiries", "Inquiry", "project_management", "CRUDPNVO", true],
  ["projects.gallery", "Gallery", "project_management", "R", true],
  ["reporting.project_dashboard", "Dashboard", "project_management", "R", true],
  [
    "site_work.progress_reports",
    "Progress Report",
    "project_management",
    "CRDNF",
    true,
  ],
  ["projects.locations", "Create Location", "project_management", "CRUD", true],
  [
    "site_work.equipment_usage",
    "Equipment Usage",
    "project_management",
    "CRUDAPNOF",
    true,
  ],
  // Payment & Accounting.
  [
    "finance.central_payment",
    "Central payment",
    "payment_accounting",
    "R",
    false,
  ],
  ["finance.payments", "Payments", "payment_accounting", "R", true],
  [
    "finance.transactions",
    "Transactions",
    "payment_accounting",
    "CRUDAJPNO",
    true,
  ],
  ["finance.parties", "Parties", "payment_accounting", "CRUDAJEPNO", true],
  [
    "finance.petty_cash",
    "Petty Cash",
    "payment_accounting",
    "CRUDAJPNVO",
    true,
  ],
  // Materials.
  ["procurement.manage_materials", "Manage Materials", "materials", "R", true],
  [
    "procurement.current_inventory",
    "Current Inventory",
    "materials",
    "CRUDPNO",
    true,
  ],
  [
    "procurement.purchase_requests",
    "Purchase Request",
    "materials",
    "CRUDAJPNO",
    true,
  ],
  [
    "procurement.purchase_orders",
    "Purchase Order",
    "materials",
    "CRUDAJPNO",
    true,
  ],
  [
    "procurement.material_received",
    "Material Received",
    "materials",
    "CRUDPNVOF",
    true,
  ],
  [
    "procurement.material_transfers",
    "Material Transfer",
    "materials",
    "CRUDAJPNO",
    true,
  ],
  [
    "procurement.central_inventory",
    "Central Inventory",
    "materials",
    "RP",
    false,
  ],
  // Master records.
  ["masters.master_records", "Master Records", "master_records", "R", false],
  [
    "organization.team_members",
    "Team Members",
    "master_records",
    "CRUD",
    false,
  ],
  ["masters.departments", "Departments", "master_records", "CRUD", false],
  ["masters.contractors", "Contractors", "master_records", "CRUD", false],
  ["masters.suppliers", "Supplier", "master_records", "CRUD", false],
  ["masters.vendors", "Vendors", "master_records", "CRUDF", false],
  ["masters.equipments", "Equipments", "master_records", "CRUDPNTOF", false],
  ["organization.settings", "Setting", "master_records", "CRUD", false],
  [
    "masters.material_categories",
    "Material Categories",
    "master_records",
    "CRUD",
    false,
  ],
  ["masters.materials", "Materials", "master_records", "CRUDF", false],
  [
    "masters.bank_accounts",
    "Company's Bank A/C",
    "master_records",
    "CRUDPO",
    false,
  ],
  ["masters.units", "Add Measurement Unit", "master_records", "CRUD", false],
  [
    "organization.designations",
    "Designations",
    "master_records",
    "CRUD",
    false,
  ],
  ["masters.quotations", "View Quotations", "master_records", "R", false],
  ["masters.amenities", "Amenities", "master_records", "CRUD", false],
  [
    "masters.common_developments",
    "Common Development",
    "master_records",
    "CRUD",
    false,
  ],
  ["masters.work_types", "Work Type", "master_records", "CRUD", false],
  ["masters.labours", "Labours", "master_records", "CRUDF", false],
  [
    "masters.labour_categories",
    "Labour Categories",
    "master_records",
    "CRUD",
    false,
  ],
  [
    "masters.payment_categories",
    "Payment Categories",
    "master_records",
    "CRUD",
    false,
  ],
  [
    "masters.issue_categories",
    "Issue Categories",
    "master_records",
    "CRUD",
    false,
  ],
  ["masters.other_parties", "Other Party", "master_records", "CRUD", false],
  // Central store.
  [
    "procurement.central_store",
    "Central store",
    "central_store",
    "CRUD",
    false,
  ],
  [
    "procurement.material_requests",
    "Central Store (MR)",
    "central_store",
    "CRUDAPNO",
    false,
  ],
  [
    "procurement.delivery_notes",
    "Delivery Note",
    "central_store",
    "CRUDAPNO",
    false,
  ],
  // HRMS.
  ["hrms.hrms", "HRMS", "hrms", "R", false],
  ["hrms.holidays", "Holiday Management", "hrms", "CRUDN", false],
  ["hrms.attendance", "Attendance Management", "hrms", "CRUDAJENVO", false],
  ["hrms.leave_structures", "Leave Structure", "hrms", "CRUD", false],
  ["hrms.leaves", "Leave Management", "hrms", "CRUDAJNVO", false],
  ["hrms.salaries", "Salary Management", "hrms", "CRUDAJENVOF", false],
  ["hrms.salary_structures", "Salary Structure", "hrms", "CRUD", false],
  ["hrms.employees", "Employee Management", "hrms", "CRUF", false],
  ["hrms.settings", "HRMS Settings", "hrms", "CRUD", false],
  ["hrms.shifts", "Shift Management", "hrms", "CRUDAEINV", false],
  // Others.
  ["reporting.central_reports", "Central Reports", "others", "R", false],
] as const satisfies readonly (readonly [
  string,
  string,
  MenuCategory,
  string,
  boolean,
])[];

export type MenuKey = (typeof DEFINITIONS)[number][0];

export type Menu = Omit<MenuDefinition, "key"> & {
  key: MenuKey;
  /** Mask of the flags this menu supports. */
  supported: number;
};

export const MENUS: readonly Menu[] = DEFINITIONS.map(
  ([key, label, category, letters, projectScoped]) => ({
    key,
    label,
    category,
    letters,
    projectScoped,
    supported: maskFromLetters(letters),
  }),
);

const BY_KEY = new Map<string, Menu>(MENUS.map((menu) => [menu.key, menu]));

export function menuByKey(key: string): Menu | null {
  return BY_KEY.get(key) ?? null;
}

export function isMenuKey(value: string): value is MenuKey {
  return BY_KEY.has(value);
}
