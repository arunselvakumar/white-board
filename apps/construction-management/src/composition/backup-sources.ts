import { accounts, companies } from "@repo/auth/construction/server";
import { Prisma, prisma, type PrismaClient } from "@repo/construction-db";

import type {
  BackupEntityReader,
  BackupMediaFile,
  BackupNames,
  BackupRow,
  MyDataReader,
} from "@/src/reporting/application/backup-ports";
import type {
  BackupColumn,
  BackupColumnType,
  BackupRawValue,
} from "@/src/reporting/domain/backup-csv";
import { BACKUP_ENTITY_KEYS } from "@/src/reporting/domain/backup-modules";

/**
 * The backup readers (ADR CM-0021 §8, CM-906): one plain read per entity
 * of each context's own tables, here in the composition root because a
 * backup spans contexts. Every reader:
 *
 * - leaves tombstoned rows out (its own `deleted_at`, or its parent's);
 * - filters by the backup's range on the entity's own date, when it has one;
 * - filters by the Project, unless it is a full Company backup;
 * - pages by id, so a large table is never read at once.
 *
 * CSV headings are the screens' labels; names stand in for ids where the
 * screen shows a name (the id stays in the JSON). Money columns are paise
 * in the database; the writer prints rupees and leaves them out without
 * the money right.
 */

type Column = BackupColumn & {
  /** SQL for the value, over the entity's aliases (`t`, its parent `p`). */
  sql: string;
  money?: boolean;
};

type EntitySpec = {
  /** `FROM` clause; the row is `t`. */
  from: string;
  /** SQL of the Company id (text). */
  workspace: string;
  /** SQL of the Project id; null for a Company-level entity. */
  project: string | null;
  /** SQL of the entity's own date, for the range; null when it has none. */
  date: string | null;
  /** Conditions that leave tombstoned rows out. */
  live: readonly string[];
  /** SQL of the record id (uuid), the paging key. */
  id: string;
  /** SQL of the record's number, for the media folder. */
  number: string | null;
  columns: readonly Column[];
  /** The stored files of a page of records, for "Media". */
  media?: (workspaceId: string, ids: readonly string[]) => Prisma.Sql;
};

// ---------------------------------------------------------------------------
// Column helpers
// ---------------------------------------------------------------------------

function col(
  field: string,
  label: string,
  sql: string,
  type: BackupColumnType = "text",
): Column {
  return { field, label, sql, type };
}

function money(field: string, label: string, sql: string): Column {
  return { field, label, sql, type: "money", money: true };
}

const id = (alias = "t") => col("id", "ID", `${alias}.id::text`, "id");

/** A name looked up by id in another table. */
function nameIn(table: string, idSql: string, name = "name"): string {
  return `(SELECT x.${name} FROM ${table} x WHERE x.id = (${idSql})::uuid)`;
}

/** Who did it: the Company's Team Member with that User, "Deleted user" otherwise. */
function who(userSql: string, workspaceSql = "t.workspace_id"): string {
  return `COALESCE((SELECT m.name FROM construction_organization.team_members m
    WHERE m.workspace_id = ${workspaceSql} AND m.user_id = ${userSql}
    ORDER BY (m.deleted_at IS NULL) DESC, m.created_at DESC LIMIT 1),
    CASE WHEN ${userSql} IS NULL THEN NULL
      WHEN EXISTS (SELECT 1 FROM construction_organization.account_deletions d WHERE d.user_id = ${userSql})
      THEN 'Deleted user' ELSE NULL END)`;
}

function memberName(memberSql: string): string {
  return nameIn("construction_organization.team_members", memberSql);
}

const projectName = (sql = "t.project_id") =>
  col("project", "Project", nameIn("construction_projects.projects", sql));

/** A procurement location: a Project or a Store. */
function locationName(sql: string): string {
  return `COALESCE(${nameIn("construction_projects.projects", sql)}, ${nameIn("construction_procurement.stores", sql)})`;
}

const contractor = (sql = "t.contractor_id") =>
  col(
    "contractor",
    "Contractor",
    nameIn("construction_masters.contractors", sql),
  );
const department = (sql = "t.department_id") =>
  col(
    "department",
    "Department",
    nameIn("construction_masters.departments", sql),
  );
const unit = (field: string, label: string, sql: string) =>
  col(field, label, nameIn("construction_masters.measurement_units", sql));
const account = (field: string, label: string, sql: string) =>
  col(field, label, nameIn("construction_finance.accounts", sql));
const paymentCategory = (sql = "t.payment_category_id") =>
  col(
    "paymentCategory",
    "Payment Category",
    nameIn("construction_finance.payment_categories", sql),
  );

function stamps(alias = "t"): Column[] {
  return [
    col(
      "createdBy",
      "Created by",
      who(`${alias}.created_by`, `${alias}.workspace_id`),
    ),
    col("createdAt", "Created on", `${alias}.created_at`, "datetime"),
  ];
}

function updated(alias = "t"): Column[] {
  return [
    col(
      "updatedBy",
      "Updated by",
      who(`${alias}.updated_by`, `${alias}.workspace_id`),
    ),
    col("updatedAt", "Updated on", `${alias}.updated_at`, "datetime"),
  ];
}

const approval = (sql = "t.approval_status") =>
  col("approvalStatus", "Approval", `${sql}::text`, "enum");

function decision(): Column[] {
  return [
    col("decidedBy", "Decided by", who("t.decided_by")),
    col("decidedAt", "Decided on", "t.decided_at", "datetime"),
  ];
}

const siteLocation = () => [
  col("siteLocationType", "Location type", "t.site_location_type", "enum"),
  col("siteLocation", "Location", "t.site_location", "json"),
];

// ---------------------------------------------------------------------------
// Media helpers
// ---------------------------------------------------------------------------

function documentFiles(table: string, documentType?: string) {
  return (workspaceId: string, ids: readonly string[]) => Prisma.sql`
    SELECT f.document_id::text AS "recordId", f.file_key AS "fileKey", f.file_name AS "fileName"
      FROM ${Prisma.raw(table)} f
     WHERE f.workspace_id = ${workspaceId}
       AND f.deleted_at IS NULL
       ${documentType == null ? Prisma.empty : Prisma.sql`AND f.document_type::text = ${documentType}`}
       AND f.document_id = ANY(${[...ids]}::uuid[])
     ORDER BY f.created_at, f.id`;
}

/** A record that is its own file (`file_key`, `file_name`). */
function ownFile(table: string) {
  return (workspaceId: string, ids: readonly string[]) => Prisma.sql`
    SELECT f.id::text AS "recordId", f.file_key AS "fileKey", f.file_name AS "fileName"
      FROM ${Prisma.raw(table)} f
     WHERE f.workspace_id = ${workspaceId}
       AND f.id = ANY(${[...ids]}::uuid[])
     ORDER BY f.id`;
}

// ---------------------------------------------------------------------------
// Child-row helper: the parent's Company, Project, date and tombstone
// ---------------------------------------------------------------------------

function child(
  table: string,
  parentTable: string,
  parentKey: string,
  parent: {
    project: string | null;
    date: string | null;
    number: string | null;
  },
  columns: readonly Column[],
): EntitySpec {
  return {
    from: `${table} t JOIN ${parentTable} p ON p.id = t.${parentKey}`,
    workspace: "p.workspace_id",
    project: parent.project,
    date: parent.date,
    live: ["p.deleted_at IS NULL"],
    id: "t.id",
    number: parent.number,
    columns,
  };
}

const SW = "construction_site_work";
const PR = "construction_procurement";
const LB = "construction_labour";
const FN = "construction_finance";
const TR = "construction_tracking";
const PJ = "construction_projects";
const MS = "construction_masters";
const OG = "construction_organization";
const HR = "construction_hrms";
const SL = "construction_sales";

const AADHAAR = (alias = "t") =>
  `CASE WHEN ${alias}.aadhaar_last4 IS NULL THEN NULL ELSE 'XXXX XXXX ' || ${alias}.aadhaar_last4 END`;
const PAN = (alias = "t") =>
  `CASE WHEN ${alias}.pan_last4 IS NULL THEN NULL ELSE 'XXXXXX' || ${alias}.pan_last4 END`;

const employee = (sql = "t.member_id") =>
  col("employee", "Employee", memberName(sql));

const materialLine = (prefix: string) => [
  col("materialName", "Material", `${prefix}.material_name`),
  col("unit", "Unit", `${prefix}.unit_name`),
  col("quantity", "Quantity", `${prefix}.quantity`, "number"),
  col("remark", "Remark", `${prefix}.remark`),
];

// ---------------------------------------------------------------------------
// The entities
// ---------------------------------------------------------------------------

const SPECS: Record<string, EntitySpec> = {
  // Project details ---------------------------------------------------------
  projects: {
    from: `${PJ}.projects t`,
    workspace: "t.workspace_id",
    project: "t.id",
    date: null,
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: null,
    columns: [
      id(),
      col("name", "Project Name", "t.name"),
      col("status", "Status", "t.status::text", "enum"),
      col("projectType", "Project Type", "t.project_type::text", "enum"),
      col("address", "Address", "t.address"),
      col("stateCode", "State", "t.state_code"),
      col("startDate", "Start Date", "t.start_date", "date"),
      col("endDate", "End Date", "t.end_date", "date"),
      col("clientName", "Client Name", "t.client_name"),
      col("clientPhone", "Client Phone", "t.client_phone"),
      col("tenderRef", "Tender Ref.", "t.tender_ref"),
      col("quotationNo", "Quotation No.", "t.quotation_no"),
      col("quotationDate", "Quotation Date", "t.quotation_date", "date"),
      col("loaNo", "LOA No.", "t.loa_no"),
      col("loaDate", "LOA Date", "t.loa_date", "date"),
      col("clientOrderNo", "Work Order No.", "t.client_order_no"),
      col("clientOrderDate", "Work Order Date", "t.client_order_date", "date"),
      col("agreementNo", "Agreement No.", "t.agreement_no"),
      col("agreementDate", "Agreement Date", "t.agreement_date", "date"),
      money("orderValue", "Order Value (₹)", "t.order_value"),
      money("budgetValue", "Budget (₹)", "t.budget_value"),
      ...stamps(),
    ],
  },
  project_custom_fields: {
    from: `${PJ}.custom_fields t JOIN ${PJ}.projects p ON p.id = t.project_id`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: null,
    live: ["p.deleted_at IS NULL"],
    id: "t.id",
    number: null,
    columns: [
      id(),
      projectName(),
      col("label", "Field", "t.label"),
      col("value", "Value", "t.value"),
    ],
  },
  project_locations: {
    from: `${PJ}.locations t`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: null,
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: null,
    columns: [
      id(),
      projectName(),
      col("name", "Location", "t.name"),
      col("description", "Description", "t.description"),
      ...stamps(),
    ],
  },

  // Daily Work --------------------------------------------------------------
  worksheets: {
    from: `${SW}.worksheets t`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: "t.sheet_date",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: "t.number",
    columns: [
      id(),
      projectName(),
      col("number", "Worksheet No.", "t.number"),
      col("sheetDate", "Date", "t.sheet_date", "date"),
      col("shift", "Shift", "t.shift::text", "enum"),
      contractor(),
      department(),
      col(
        "workType",
        "Work Type",
        nameIn(`${MS}.work_types`, "t.work_type_id"),
      ),
      col("skilledCount", "Skilled", "t.skilled_count", "number"),
      col("unskilledCount", "Unskilled", "t.unskilled_count", "number"),
      col("approxWorkQty", "Approx. Work Done", "t.approx_work_qty", "number"),
      unit("approxWorkUnit", "Unit", "t.approx_work_unit_id"),
      ...siteLocation(),
      col("remark", "Remark", "t.remark"),
      approval(),
      ...decision(),
      col("rejectionReason", "Rejection Reason", "t.rejection_reason"),
      ...stamps(),
    ],
    media: documentFiles(`${SW}.document_files`, "worksheet"),
  },
  worksheet_materials: child(
    `${SW}.worksheet_materials`,
    `${SW}.worksheets`,
    "worksheet_id",
    { project: "p.project_id", date: "p.sheet_date", number: "p.number" },
    [
      id(),
      col("worksheetId", "Worksheet ID", "t.worksheet_id::text", "id"),
      col("worksheetNumber", "Worksheet No.", "p.number"),
      ...materialLine("t"),
    ],
  ),
  equipment_usage_sheets: {
    from: `${SW}.equipment_usage_sheets t`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: "t.sheet_date",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: "t.number",
    columns: [
      id(),
      projectName(),
      col("number", "Sheet No.", "t.number"),
      col("sheetDate", "Date", "t.sheet_date", "date"),
      col("shift", "Shift", "t.shift::text", "enum"),
      col(
        "equipment",
        "Equipment",
        nameIn(`${SW}.equipment`, "t.equipment_id"),
      ),
      col("ownership", "Ownership", "t.ownership::text", "enum"),
      col("operatorName", "Operator", "t.operator_name"),
      contractor(),
      department(),
      col("workItem", "Work Item", "t.work_item"),
      ...siteLocation(),
      col("usageHours", "Usage Hours", "t.usage_hours", "number"),
      col("distanceKm", "Distance (km)", "t.distance_km", "number"),
      col("trips", "Trips", "t.trips", "number"),
      col("openingReading", "Opening Reading", "t.opening_reading", "number"),
      col("closingReading", "Closing Reading", "t.closing_reading", "number"),
      col("idleHours", "Idle Hours", "t.idle_hours", "number"),
      col("breakdownHours", "Breakdown Hours", "t.breakdown_hours", "number"),
      col("approxWorkQty", "Approx. Work Done", "t.approx_work_qty", "number"),
      col("fuelQty", "Fuel", "t.fuel_qty", "number"),
      col("fuelBorneBy", "Fuel Borne By", "t.fuel_borne_by::text", "enum"),
      col("fuelOverrun", "Fuel Overrun", "t.fuel_overrun", "bool"),
      col("billableQty", "Billable Qty", "t.billable_qty", "number"),
      money("unitRate", "Unit Rate (₹)", "t.unit_rate"),
      money("hireCost", "Hire Cost (₹)", "t.hire_cost"),
      col("remark", "Remark", "t.remark"),
      approval(),
      ...decision(),
      ...stamps(),
    ],
    media: documentFiles(`${SW}.document_files`, "equipment_usage"),
  },
  equipment_usage_materials: child(
    `${SW}.equipment_usage_materials`,
    `${SW}.equipment_usage_sheets`,
    "sheet_id",
    { project: "p.project_id", date: "p.sheet_date", number: "p.number" },
    [
      id(),
      col("sheetId", "Sheet ID", "t.sheet_id::text", "id"),
      col("sheetNumber", "Sheet No.", "p.number"),
      ...materialLine("t"),
    ],
  ),
  site_diaries: {
    from: `${SW}.site_diaries t`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: "t.diary_date",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: "to_char(t.diary_date, 'YYYY-MM-DD')",
    columns: [
      id(),
      projectName(),
      col("diaryDate", "Date", "t.diary_date", "date"),
      col(
        "weatherMorning",
        "Weather (morning)",
        "t.weather_morning::text",
        "enum",
      ),
      col(
        "weatherAfternoon",
        "Weather (afternoon)",
        "t.weather_afternoon::text",
        "enum",
      ),
      col("rainfallMm", "Rainfall (mm)", "t.rainfall_mm", "number"),
      col("siteCondition", "Site Condition", "t.site_condition"),
      col("notes", "Notes", "t.notes"),
      ...stamps(),
    ],
    media: documentFiles(`${SW}.document_files`, "site_diary"),
  },
  site_diary_visitors: child(
    `${SW}.site_diary_visitors`,
    `${SW}.site_diaries`,
    "diary_id",
    { project: "p.project_id", date: "p.diary_date", number: null },
    [
      id(),
      col("diaryDate", "Diary Date", "p.diary_date", "date"),
      col("name", "Visitor", "t.name"),
      col("organisation", "Organisation", "t.organisation"),
      col("purpose", "Purpose", "t.purpose"),
      col("timeIn", "Time In", "t.time_in"),
      col("timeOut", "Time Out", "t.time_out"),
    ],
  ),
  site_diary_instructions: child(
    `${SW}.site_diary_instructions`,
    `${SW}.site_diaries`,
    "diary_id",
    { project: "p.project_id", date: "p.diary_date", number: null },
    [
      id(),
      col("diaryDate", "Diary Date", "p.diary_date", "date"),
      col("givenBy", "Given By", "t.given_by"),
      col("givenTo", "Given To", "t.given_to"),
      col("instruction", "Instruction", "t.instruction"),
      col("actionTaken", "Action Taken", "t.action_taken"),
    ],
  ),
  hindrances: {
    from: `${SW}.hindrances t`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: "t.start_date",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: "t.number",
    columns: [
      id(),
      projectName(),
      col("number", "Hindrance No.", "t.number"),
      col("startDate", "From", "t.start_date", "date"),
      col("endDate", "To", "t.end_date", "date"),
      col("hoursLost", "Hours Lost", "t.hours_lost", "number"),
      col("cause", "Cause", "t.cause::text", "enum"),
      col("affectedActivity", "Affected Activity", "t.affected_activity"),
      ...siteLocation(),
      col(
        "responsibleParty",
        "Responsible",
        "t.responsible_party::text",
        "enum",
      ),
      contractor(),
      col("description", "Description", "t.description"),
      col("signOffPartyName", "Signed Off By", "t.sign_off_party_name"),
      col("signedOn", "Signed On", "t.signed_on", "date"),
      ...stamps(),
    ],
    media: documentFiles(`${SW}.document_files`, "hindrance"),
  },

  // Materials ---------------------------------------------------------------
  purchase_requests: {
    from: `${PR}.purchase_requests t`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: "t.request_date",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: "t.number",
    columns: [
      id(),
      projectName(),
      col("number", "PR No.", "t.number"),
      col("requestDate", "PR Date", "t.request_date", "date"),
      col("requiredDate", "Required By", "t.required_date", "date"),
      col("source", "Source", "t.source::text", "enum"),
      ...siteLocation(),
      col("remark", "Remark", "t.remark"),
      approval(),
      col("orderStatus", "Order Status", "t.order_status::text", "enum"),
      ...decision(),
      col("rejectionReason", "Rejection Reason", "t.rejection_reason"),
      ...stamps(),
    ],
    media: documentFiles(`${PR}.document_files`),
  },
  purchase_request_items: child(
    `${PR}.purchase_request_items`,
    `${PR}.purchase_requests`,
    "purchase_request_id",
    { project: "p.project_id", date: "p.request_date", number: "p.number" },
    [
      id(),
      col("purchaseRequestId", "PR ID", "t.purchase_request_id::text", "id"),
      col("prNumber", "PR No.", "p.number"),
      col("materialName", "Material", "t.material_name"),
      col("unit", "Unit", "t.uom_name"),
      col("quantity", "Quantity", "t.quantity", "number"),
      col("orderedQty", "Ordered", "t.ordered_qty", "number"),
      col("remark", "Remark", "t.remark"),
    ],
  ),
  purchase_orders: {
    from: `${PR}.purchase_orders t`,
    workspace: "t.workspace_id",
    project: "t.location_id",
    date: "t.order_date",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: "t.number",
    columns: [
      id(),
      col("location", "Project / Store", locationName("t.location_id")),
      col("number", "PO No.", "t.number"),
      col("orderDate", "PO Date", "t.order_date", "date"),
      col(
        "expectedDeliveryDate",
        "Expected Delivery",
        "t.expected_delivery_date",
        "date",
      ),
      col("supplierName", "Supplier", "t.supplier_name"),
      col("supplierGstin", "Supplier GSTIN", "t.supplier_gstin"),
      col("supplyType", "Supply Type", "t.supply_type::text", "enum"),
      col("billingName", "Bill To", "t.billing_name"),
      col(
        "paymentTermsDays",
        "Payment Terms (days)",
        "t.payment_terms_days",
        "number",
      ),
      col("remark", "Remark", "t.remark"),
      money("subTotal", "Sub Total (₹)", "t.sub_total"),
      money("discountTotal", "Discount (₹)", "t.discount_total"),
      money("taxableTotal", "Taxable (₹)", "t.taxable_total"),
      money("cgstTotal", "CGST (₹)", "t.cgst_total"),
      money("sgstTotal", "SGST (₹)", "t.sgst_total"),
      money("igstTotal", "IGST (₹)", "t.igst_total"),
      money(
        "additionalCharges",
        "Additional Charges (₹)",
        "t.additional_charges",
      ),
      money("deductionAmount", "Deduction (₹)", "t.deduction_amount"),
      money("grandTotal", "Grand Total (₹)", "t.grand_total"),
      approval(),
      col("receiptStatus", "Receipt Status", "t.receipt_status::text", "enum"),
      ...decision(),
      col("closedAt", "Closed On", "t.closed_at", "datetime"),
      col("closeReason", "Close Reason", "t.close_reason"),
      ...stamps(),
    ],
    media: documentFiles(`${PR}.document_files`),
  },
  purchase_order_items: child(
    `${PR}.purchase_order_items`,
    `${PR}.purchase_orders`,
    "purchase_order_id",
    { project: "p.location_id", date: "p.order_date", number: "p.number" },
    [
      id(),
      col("purchaseOrderId", "PO ID", "t.purchase_order_id::text", "id"),
      col("poNumber", "PO No.", "p.number"),
      col("materialName", "Material", "t.material_name"),
      col("unit", "Unit", "t.uom_name"),
      col("hsnCode", "HSN", "t.hsn_code"),
      col("quantity", "Quantity", "t.quantity", "number"),
      money("unitRate", "Rate (₹)", "t.unit_rate"),
      money("discountAmount", "Discount (₹)", "t.discount_amount"),
      col("gstRate", "GST %", "t.gst_rate", "number"),
      money("taxable", "Taxable (₹)", "t.taxable"),
      money("total", "Total (₹)", "t.total"),
      col("receivedQty", "Received", "t.received_qty", "number"),
      col("remark", "Remark", "t.remark"),
    ],
  ),
  goods_receipts: {
    from: `${PR}.goods_receipts t`,
    workspace: "t.workspace_id",
    project: "t.location_id",
    date: "t.receipt_date",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: "t.number",
    columns: [
      id(),
      col("location", "Project / Store", locationName("t.location_id")),
      col("number", "GRN No.", "t.number"),
      col("receiptDate", "Received On", "t.receipt_date", "date"),
      col("inventoryDate", "Inventory Date", "t.inventory_date", "date"),
      col("supplierName", "Supplier", "t.supplier_name"),
      col(
        "purchaseOrder",
        "PO No.",
        nameIn(`${PR}.purchase_orders`, "t.purchase_order_id", "number"),
      ),
      col("invoiceNo", "Invoice No.", "t.invoice_no"),
      col("invoiceDate", "Invoice Date", "t.invoice_date", "date"),
      money("invoiceAmount", "Invoice Amount (₹)", "t.invoice_amount"),
      col("deliveryChallanNo", "Delivery Challan No.", "t.delivery_challan_no"),
      col("vehicleNo", "Vehicle No.", "t.vehicle_no"),
      col("driverName", "Driver", "t.driver_name"),
      col("ewayBillNo", "E-way Bill No.", "t.eway_bill_no"),
      col("remark", "Remark", "t.remark"),
      money("taxableTotal", "Taxable (₹)", "t.taxable_total"),
      money("cgstTotal", "CGST (₹)", "t.cgst_total"),
      money("sgstTotal", "SGST (₹)", "t.sgst_total"),
      money("igstTotal", "IGST (₹)", "t.igst_total"),
      money("totalValue", "Total (₹)", "t.total_value"),
      ...stamps(),
    ],
    media: documentFiles(`${PR}.document_files`),
  },
  goods_receipt_items: child(
    `${PR}.goods_receipt_items`,
    `${PR}.goods_receipts`,
    "goods_receipt_id",
    { project: "p.location_id", date: "p.receipt_date", number: "p.number" },
    [
      id(),
      col("goodsReceiptId", "GRN ID", "t.goods_receipt_id::text", "id"),
      col("grnNumber", "GRN No.", "p.number"),
      col("materialName", "Material", "t.material_name"),
      col("unit", "Unit", "t.uom_name"),
      col("receivedQty", "Received", "t.received_qty", "number"),
      money("unitRate", "Rate (₹)", "t.unit_rate"),
      col("gstRate", "GST %", "t.gst_rate", "number"),
      money("taxable", "Taxable (₹)", "t.taxable"),
      money("total", "Total (₹)", "t.total"),
    ],
  ),
  material_transfers: {
    from: `${PR}.material_transfers t`,
    workspace: "t.workspace_id",
    project: null,
    date: "t.transfer_date",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: "t.number",
    columns: [
      id(),
      col("number", "Transfer No.", "t.number"),
      col("transferDate", "Date", "t.transfer_date", "date"),
      col("from", "From", locationName("t.from_id")),
      col("to", "To", locationName("t.to_id")),
      col("receiverName", "Receiver", "t.receiver_name"),
      col("remark", "Remark", "t.remark"),
      approval(),
      ...decision(),
      col("deliveredOn", "Delivered On", "t.delivered_on", "date"),
      ...stamps(),
    ],
    media: documentFiles(`${PR}.document_files`),
  },
  material_transfer_items: child(
    `${PR}.material_transfer_items`,
    `${PR}.material_transfers`,
    "material_transfer_id",
    { project: null, date: "p.transfer_date", number: "p.number" },
    [
      id(),
      col(
        "materialTransferId",
        "Transfer ID",
        "t.material_transfer_id::text",
        "id",
      ),
      col("transferNumber", "Transfer No.", "p.number"),
      col("materialName", "Material", "t.material_name"),
      col("unit", "Unit", "t.uom_name"),
      col("quantity", "Quantity", "t.quantity", "number"),
      col("remark", "Remark", "t.remark"),
    ],
  ),
  stock_entries: {
    from: `${PR}.stock_entries t`,
    workspace: "t.workspace_id",
    project: "t.location_id",
    date: "t.entry_date",
    live: [],
    id: "t.id",
    number: null,
    columns: [
      id(),
      col("location", "Project / Store", locationName("t.location_id")),
      col("entryDate", "Date", "t.entry_date", "date"),
      col("material", "Material", nameIn(`${MS}.materials`, "t.material_id")),
      col("type", "Entry", "t.type::text", "enum"),
      col("sourceType", "Source", "t.source_type::text", "enum"),
      col("quantity", "Quantity", "t.quantity", "number"),
      col("counterparty", "From / To", "t.counterparty_label"),
      col("remark", "Remark", "t.remark"),
      col("reversesEntryId", "Reverses", "t.reverses_entry_id::text", "id"),
      ...stamps(),
    ],
  },
  stock_consumption: {
    from: `${PR}.stock_movements t`,
    workspace: "t.workspace_id",
    project: "t.location_id",
    date: "t.movement_date",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: null,
    columns: [
      id(),
      col("location", "Project / Store", locationName("t.location_id")),
      col("movementDate", "Date", "t.movement_date", "date"),
      col("kind", "Kind", "t.kind::text", "enum"),
      col("material", "Material", nameIn(`${MS}.materials`, "t.material_id")),
      col("quantity", "Quantity", "t.quantity", "number"),
      ...siteLocation(),
      col("remark", "Remark", "t.remark"),
      ...stamps(),
    ],
  },

  // Labour ------------------------------------------------------------------
  labour_attendance: {
    from: `${LB}.labour_attendance t`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: "t.attendance_date",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: null,
    columns: [
      id(),
      projectName(),
      col("attendanceDate", "Date", "t.attendance_date", "date"),
      col("labour", "Labour", nameIn(`${LB}.labours`, "t.labour_id")),
      col("status", "Attendance", "t.status::text", "enum"),
      col("isPaidLeave", "Paid Leave", "t.is_paid_leave", "bool"),
      col("shift", "Shift", "t.shift"),
      col(
        "supervisor",
        "Supervisor",
        nameIn(`${MS}.supervisors`, "t.supervisor_id"),
      ),
      col("checkIn", "Check In", "t.check_in"),
      col("checkOut", "Check Out", "t.check_out"),
      col("breakMinutes", "Break (min)", "t.break_minutes", "number"),
      col("workingHours", "Working Hours", "t.working_hours", "number"),
      col(
        "overtimeHours",
        "OT Hours",
        `(SELECT COALESCE(SUM(o.hours), 0) FROM ${LB}.labour_overtime o WHERE o.attendance_id = t.id)`,
        "number",
      ),
      col("wageType", "Wage Type", "t.wage_type::text", "enum"),
      money("wageRate", "Wage Rate (₹)", "t.wage_rate"),
      money("earned", "Earned (₹)", "t.earned"),
      money(
        "overtimeAmount",
        "OT Amount (₹)",
        `(SELECT COALESCE(SUM(o.amount), 0) FROM ${LB}.labour_overtime o WHERE o.attendance_id = t.id)`,
      ),
      ...stamps(),
    ],
  },
  labour_payments: {
    from: `${LB}.wage_payments t`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: "t.payment_date",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: "t.reference",
    columns: [
      id(),
      projectName(),
      col("paymentDate", "Date", "t.payment_date", "date"),
      col("partyType", "Paid To", "t.party_type::text", "enum"),
      col(
        "party",
        "Labour / Vendor",
        `COALESCE(${nameIn(`${LB}.labours`, "t.party_id")}, ${nameIn(`${LB}.vendors`, "t.party_id")})`,
      ),
      col("kind", "Payment", "t.kind::text", "enum"),
      col("mode", "Mode", "t.mode::text", "enum"),
      account("account", "Account", "t.account_id"),
      col("reference", "Reference", "t.reference"),
      money("amount", "Amount (₹)", "t.amount"),
      col("paidBy", "Paid By", memberName("t.paid_by_member_id")),
      col("remarks", "Remarks", "t.remarks"),
      ...stamps(),
    ],
    media: (workspaceId, ids) => Prisma.sql`
      SELECT f.id::text AS "recordId", f.document_key AS "fileKey",
             regexp_replace(f.document_key, '^.*/', '') AS "fileName"
        FROM construction_labour.wage_payments f
       WHERE f.workspace_id = ${workspaceId}
         AND f.document_key IS NOT NULL
         AND f.id = ANY(${[...ids]}::uuid[])`,
  },
  vendor_attendance: {
    from: `${LB}.vendor_attendance t`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: "t.attendance_date",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: null,
    columns: [
      id(),
      projectName(),
      col("attendanceDate", "Date", "t.attendance_date", "date"),
      col("vendor", "Vendor", nameIn(`${LB}.vendors`, "t.vendor_id")),
      money("totalPay", "Total Pay (₹)", "t.total_pay"),
      ...stamps(),
    ],
  },
  vendor_attendance_lines: child(
    `${LB}.vendor_attendance_lines`,
    `${LB}.vendor_attendance`,
    "attendance_id",
    { project: "p.project_id", date: "p.attendance_date", number: null },
    [
      id(),
      col("attendanceId", "Attendance ID", "t.attendance_id::text", "id"),
      col("attendanceDate", "Date", "p.attendance_date", "date"),
      col("vendor", "Vendor", nameIn(`${LB}.vendors`, "p.vendor_id")),
      col("shiftName", "Shift", "t.shift_name"),
      col(
        "labourCategory",
        "Labour Category",
        nameIn(`${MS}.labour_categories`, "t.labour_category_id"),
      ),
      col("fullDayCount", "Full Day", "t.full_day_count", "number"),
      col("halfDayCount", "Half Day", "t.half_day_count", "number"),
      col("overtimeHours", "OT Hours", "t.overtime_hours", "number"),
      money("ratePerDay", "Rate / Day (₹)", "t.rate_per_day"),
      money("overtimePerHour", "OT / Hour (₹)", "t.overtime_per_hour"),
      money("amount", "Amount (₹)", "t.amount"),
    ],
  ),

  // Payment & Accounting ----------------------------------------------------
  transactions: {
    from: `${FN}.transactions t`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: "t.transaction_date",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: "t.number",
    columns: [
      id(),
      projectName(),
      col("store", "Store", nameIn(`${PR}.stores`, "t.store_id")),
      col("number", "Transaction No.", "t.number"),
      col("transactionDate", "Date", "t.transaction_date", "date"),
      col("type", "Type", "t.type::text", "enum"),
      account("account", "Account", "t.account_id"),
      col("mode", "Mode", "t.mode::text", "enum"),
      paymentCategory(),
      col("chequeNumber", "Cheque No.", "t.cheque_number"),
      col("reference", "Reference", "t.reference"),
      col("counterparty", "Paid To / Received From", "t.counterparty_name"),
      money("amount", "Amount (₹)", "t.amount"),
      col("description", "Description", "t.description"),
      approval(),
      ...decision(),
      col("rejectReason", "Rejection Reason", "t.reject_reason"),
      ...stamps(),
    ],
    media: documentFiles(`${FN}.document_files`),
  },
  account_transfers: {
    from: `${FN}.account_transfers t`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: "t.transfer_date",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: "t.number",
    columns: [
      id(),
      projectName(),
      col("number", "Transfer No.", "t.number"),
      col("transferDate", "Date", "t.transfer_date", "date"),
      account("fromAccount", "From Account", "t.from_account_id"),
      account("toAccount", "To Account", "t.to_account_id"),
      col("mode", "Mode", "t.mode::text", "enum"),
      col("reference", "Reference", "t.reference"),
      money("amount", "Amount (₹)", "t.amount"),
      col("description", "Description", "t.description"),
      approval(),
      ...decision(),
      ...stamps(),
    ],
  },
  petty_cash_vouchers: {
    from: `${FN}.petty_cash_vouchers t`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: "t.voucher_date",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: "t.number",
    columns: [
      id(),
      projectName(),
      col("number", "Voucher No.", "t.number"),
      col("voucherDate", "Date", "t.voucher_date", "date"),
      col("voucherType", "Voucher Type", "t.voucher_type::text", "enum"),
      account("account", "Petty Cash Account", "t.account_id"),
      account("toAccount", "To Account", "t.to_account_id"),
      paymentCategory(),
      col("counterparty", "Paid To", "t.counterparty_name"),
      money("amount", "Amount (₹)", "t.amount"),
      col("paidFor", "Paid For", "t.paid_for"),
      col("reference", "Reference", "t.reference"),
      col("description", "Description", "t.description"),
      approval(),
      ...decision(),
      col("rejectReason", "Rejection Reason", "t.reject_reason"),
      ...stamps(),
    ],
    media: documentFiles(`${FN}.document_files`),
  },
  party_invoices: {
    from: `${FN}.invoices t`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: "t.invoice_date",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: "t.invoice_number",
    columns: [
      id(),
      projectName(),
      col("store", "Store", nameIn(`${PR}.stores`, "t.store_id")),
      col("partyType", "Party Type", "t.party_type::text", "enum"),
      col(
        "party",
        "Party",
        `COALESCE(${nameIn(`${MS}.contractors`, "t.party_id")}, ${nameIn(`${MS}.suppliers`, "t.party_id")}, ${nameIn(`${FN}.other_parties`, "t.party_id")}, ${nameIn(`${LB}.vendors`, "t.party_id")})`,
      ),
      col("direction", "Direction", "t.direction::text", "enum"),
      col("origin", "Origin", "t.origin::text", "enum"),
      col("invoiceNumber", "Invoice No.", "t.invoice_number"),
      col("invoiceDate", "Invoice Date", "t.invoice_date", "date"),
      col("dueDate", "Due Date", "t.due_date", "date"),
      department(),
      money("taxableAmount", "Taxable (₹)", "t.taxable_amount"),
      money("gstAmount", "GST (₹)", "t.gst_amount"),
      money("amount", "Amount (₹)", "t.amount"),
      col("remarks", "Remarks", "t.remarks"),
      col("settledAt", "Settled On", "t.settled_at", "datetime"),
      ...stamps(),
    ],
    media: documentFiles(`${FN}.document_files`),
  },
  party_payments: {
    from: `${FN}.party_payments t`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: "t.payment_date",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: "t.number",
    columns: [
      id(),
      projectName(),
      col("store", "Store", nameIn(`${PR}.stores`, "t.store_id")),
      col("number", "Payment No.", "t.number"),
      col("paymentDate", "Date", "t.payment_date", "date"),
      col("partyType", "Party Type", "t.party_type::text", "enum"),
      col(
        "party",
        "Party",
        `COALESCE(${nameIn(`${MS}.contractors`, "t.party_id")}, ${nameIn(`${MS}.suppliers`, "t.party_id")}, ${nameIn(`${FN}.other_parties`, "t.party_id")}, ${nameIn(`${LB}.vendors`, "t.party_id")})`,
      ),
      col("direction", "Direction", "t.direction::text", "enum"),
      account("account", "Account", "t.account_id"),
      col("mode", "Mode", "t.mode::text", "enum"),
      col("chequeNumber", "Cheque No.", "t.cheque_number"),
      col("reference", "Reference", "t.reference"),
      money("amount", "Amount (₹)", "t.amount"),
      col("tdsSection", "TDS Section", "t.tds_section"),
      col("tdsRate", "TDS %", "t.tds_rate", "number"),
      money("tdsAmount", "TDS (₹)", "t.tds_amount"),
      paymentCategory(),
      col("paidBy", "Paid By", memberName("t.paid_by_member_id")),
      col("remarks", "Remarks", "t.remarks"),
      ...stamps(),
    ],
    media: documentFiles(`${FN}.document_files`),
  },
  other_expenses: {
    from: `${FN}.other_expenses t`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: "t.expense_date",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: "t.number",
    columns: [
      id(),
      projectName(),
      col("number", "Expense No.", "t.number"),
      col("expenseDate", "Date", "t.expense_date", "date"),
      paymentCategory(),
      col("payeeName", "Paid To", "t.payee_name"),
      account("account", "Account", "t.account_id"),
      col("mode", "Mode", "t.mode::text", "enum"),
      col("reference", "Reference", "t.reference"),
      money("amount", "Amount (₹)", "t.amount"),
      col("description", "Description", "t.description"),
      approval(),
      ...decision(),
      col("rejectReason", "Rejection Reason", "t.reject_reason"),
      ...stamps(),
    ],
    media: documentFiles(`${FN}.document_files`),
  },

  // Tracking ----------------------------------------------------------------
  tasks: {
    from: `${TR}.tasks t`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: "COALESCE(t.start_date, t.due_date, t.created_at::date)",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: "'Task ' || t.task_no",
    columns: [
      id(),
      projectName(),
      col("taskNo", "Task No.", "t.task_no", "number"),
      col(
        "parentTaskNo",
        "Parent Task No.",
        `(SELECT x.task_no FROM ${TR}.tasks x WHERE x.id = t.parent_id)`,
        "number",
      ),
      col("name", "Task", "t.name"),
      col("description", "Description", "t.description"),
      col("priority", "Priority", "t.priority::text", "enum"),
      col("startDate", "Start Date", "t.start_date", "date"),
      col("dueDate", "Due Date", "t.due_date", "date"),
      col(
        "assignees",
        "Assigned To",
        `(SELECT string_agg(m.name, ', ' ORDER BY m.name) FROM ${TR}.task_assignees a JOIN ${OG}.team_members m ON m.id = a.member_id WHERE a.task_id = t.id)`,
      ),
      col(
        "tags",
        "Tags",
        `(SELECT string_agg(g.name, ', ' ORDER BY g.name) FROM ${TR}.task_tags a JOIN ${MS}.tags g ON g.id = a.tag_id WHERE a.task_id = t.id)`,
      ),
      department(),
      contractor(),
      ...siteLocation(),
      col("totalWorkQty", "Total Work", "t.total_work_qty", "number"),
      unit("totalWorkUnit", "Unit", "t.total_work_unit_id"),
      col("completedWorkQty", "Work Done", "t.completed_work_qty", "number"),
      col("progressPct", "Progress %", "t.progress_pct", "number"),
      money("totalPrice", "Total Price (₹)", "t.total_price"),
      col("actualStart", "Actual Start", "t.actual_start", "date"),
      col("actualEnd", "Actual End", "t.actual_end", "date"),
      ...stamps(),
    ],
    media: documentFiles(`${TR}.document_files`, "task"),
  },
  task_progress: {
    from: `${TR}.task_progress t JOIN ${TR}.tasks p ON p.id = t.task_id`,
    workspace: "t.workspace_id",
    project: "p.project_id",
    date: "t.progress_date",
    live: ["t.deleted_at IS NULL", "p.deleted_at IS NULL"],
    id: "t.id",
    number: null,
    columns: [
      id(),
      col("taskId", "Task ID", "t.task_id::text", "id"),
      col("taskNo", "Task No.", "p.task_no", "number"),
      col("progressDate", "Date", "t.progress_date", "date"),
      col("source", "Source", "t.source::text", "enum"),
      col("workQty", "Work Done", "t.work_qty", "number"),
      col("progressPct", "Progress %", "t.progress_pct", "number"),
      col("worksheetNumber", "Worksheet No.", "t.worksheet_number"),
      col("remark", "Remark", "t.remark"),
      ...stamps(),
    ],
  },
  issues: {
    from: `${TR}.issues t`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: "t.issue_date",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: "t.number",
    columns: [
      id(),
      projectName(),
      col("number", "Issue No.", "t.number"),
      col("issueDate", "Issue Date", "t.issue_date", "date"),
      col("details", "Details", "t.details"),
      col(
        "category",
        "Category",
        nameIn(`${MS}.issue_categories`, "t.category_id"),
      ),
      col("priority", "Priority", "t.priority::text", "enum"),
      col("status", "Status", "t.status::text", "enum"),
      department(),
      contractor(),
      col("assignee", "Assigned To", memberName("t.assignee_member_id")),
      col("dueDate", "Due Date", "t.due_date", "date"),
      ...siteLocation(),
      col("solvedAt", "Solved On", "t.solved_at", "datetime"),
      col("closedAt", "Closed On", "t.closed_at", "datetime"),
      ...stamps(),
    ],
    media: documentFiles(`${TR}.document_files`, "issue"),
  },
  issue_updates: {
    from: `${TR}.issue_updates t JOIN ${TR}.issues p ON p.id = t.issue_id`,
    workspace: "t.workspace_id",
    project: "p.project_id",
    date: "t.created_at::date",
    live: ["t.deleted_at IS NULL", "p.deleted_at IS NULL"],
    id: "t.id",
    number: null,
    columns: [
      id(),
      col("issueId", "Issue ID", "t.issue_id::text", "id"),
      col("issueNumber", "Issue No.", "p.number"),
      col("body", "Update", "t.body"),
      ...stamps(),
    ],
  },
  // Sales (CM-1008): bookings, their history and the units' sales details.
  bookings: {
    from: `${SL}.bookings t`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: "t.booking_date",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: null,
    columns: [
      id(),
      projectName(),
      col("wing", "Wing", nameIn(`${PJ}.wings`, "t.wing_id")),
      col("unit", "Unit", nameIn(`${PJ}.units`, "t.unit_id")),
      col("status", "Status", "t.status::text", "enum"),
      col("bookingDate", "Booking Date", "t.booking_date", "date"),
      col("holdUntil", "Hold until", "t.hold_until", "date"),
      col("customerName", "Customer", "t.customer_name"),
      col("customerMobile", "Mobile", "t.customer_mobile"),
      col("customerEmail", "Email", "t.customer_email"),
      col("customerAddress", "Address", "t.customer_address"),
      col("referredByName", "Referred By", "t.referred_by_name"),
      col("referredByContact", "Referred By contact", "t.referred_by_contact"),
      col("remarks", "Remarks", "t.remarks"),
      col("inquiryId", "Inquiry ID", "t.inquiry_id::text", "id"),
      col("confirmedOn", "Booked on", "t.confirmed_on", "date"),
      col("cancelledOn", "Cancelled on", "t.cancelled_on", "date"),
      col("cancelReason", "Cancel reason", "t.cancel_reason"),
      ...stamps(),
      ...updated(),
    ],
    media: documentFiles(`${SL}.document_files`, "booking"),
  },
  booking_events: {
    from: `${SL}.booking_events t JOIN ${SL}.bookings p ON p.id = t.booking_id`,
    workspace: "t.workspace_id",
    project: "p.project_id",
    // With its booking: a booking in the range brings its whole history.
    date: "p.booking_date",
    live: ["p.deleted_at IS NULL"],
    id: "t.id",
    number: null,
    columns: [
      id(),
      col("bookingId", "Booking ID", "t.booking_id::text", "id"),
      col("unit", "Unit", nameIn(`${PJ}.units`, "p.unit_id")),
      col("status", "Status", "t.status::text", "enum"),
      col("onDate", "Date", "t.on_date", "date"),
      col("holdUntil", "Hold until", "t.hold_until", "date"),
      col("reason", "Reason", "t.reason"),
      col(
        "by",
        "By",
        `CASE WHEN t.actor_user_id = 'system' THEN 'System' ELSE ${who("t.actor_user_id")} END`,
      ),
      col("occurredAt", "Recorded on", "t.occurred_at", "datetime"),
    ],
  },
  // Sales (CM-1008): inquiries with their history, follow-ups and tasks.
  inquiries: {
    from: `${SL}.inquiries t`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: "t.inquiry_date",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: null,
    columns: [
      id(),
      projectName(),
      col("inquiryDate", "Inquiry Date", "t.inquiry_date", "date"),
      col("name", "Name", "t.name"),
      col("mobile", "Mobile", "t.mobile"),
      col("email", "Email", "t.email"),
      col("address", "Address", "t.address"),
      col("occupation", "Occupation", "t.occupation"),
      col("interestType", "Interest Type", "t.interest_type::text", "enum"),
      col(
        "interestedWing",
        "Interested In (Wing)",
        nameIn(`${PJ}.wings`, "t.interested_wing_id"),
      ),
      col(
        "interestedUnitType",
        "Interested In (unit type)",
        "t.interested_unit_type",
      ),
      col(
        "leadSource",
        "Lead Source",
        nameIn(`${SL}.lead_sources`, "t.lead_source_id"),
      ),
      col("stage", "Stage", nameIn(`${SL}.funnel_stages`, "t.funnel_stage_id")),
      col("status", "Status", "t.status::text", "enum"),
      col(
        "nextFollowUpAt",
        "Next follow-up",
        "t.next_follow_up_at",
        "datetime",
      ),
      col("assignee", "Assignee", memberName("t.assignee_member_id")),
      col("leadOwner", "Lead Owner", memberName("t.lead_owner_member_id")),
      col("remarks", "Remarks", "t.remarks"),
      col(
        "convertedBookingId",
        "Booking ID",
        "t.converted_booking_id::text",
        "id",
      ),
      col(
        "lostReason",
        "Lost Reason",
        nameIn(`${SL}.lost_reasons`, "t.lost_reason_id"),
      ),
      col("lostRemarks", "Lost remarks", "t.lost_remarks"),
      col("closedAt", "Closed on", "t.closed_at", "datetime"),
      ...stamps(),
      ...updated(),
    ],
    media: documentFiles(`${SL}.document_files`, "inquiry"),
  },
  inquiry_events: {
    from: `${SL}.inquiry_events t JOIN ${SL}.inquiries p ON p.id = t.inquiry_id`,
    workspace: "t.workspace_id",
    project: "p.project_id",
    // With its inquiry: an inquiry in the range brings its whole history.
    date: "p.inquiry_date",
    live: ["p.deleted_at IS NULL"],
    id: "t.id",
    number: null,
    columns: [
      id(),
      col("inquiryId", "Inquiry ID", "t.inquiry_id::text", "id"),
      col("inquiry", "Inquiry", "p.name"),
      col("type", "What happened", "t.type::text", "enum"),
      col("details", "Details", "t.details", "json"),
      col("by", "By", who("t.actor_user_id")),
      col("occurredAt", "On", "t.occurred_at", "datetime"),
    ],
  },
  follow_ups: {
    from: `${SL}.follow_ups t JOIN ${SL}.inquiries p ON p.id = t.inquiry_id`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: "p.inquiry_date",
    live: ["t.deleted_at IS NULL", "p.deleted_at IS NULL"],
    id: "t.id",
    number: null,
    columns: [
      id(),
      col("inquiryId", "Inquiry ID", "t.inquiry_id::text", "id"),
      col("inquiry", "Inquiry", "p.name"),
      col("activity", "Activity", "t.activity::text", "enum"),
      col("doneAt", "Done on", "t.done_at", "datetime"),
      col("remarks", "Remarks", "t.remarks"),
      col(
        "fromStage",
        "From stage",
        nameIn(`${SL}.funnel_stages`, "t.from_stage_id"),
      ),
      col(
        "toStage",
        "To stage",
        nameIn(`${SL}.funnel_stages`, "t.to_stage_id"),
      ),
      col(
        "nextFollowUpAt",
        "Next follow-up",
        "t.next_follow_up_at",
        "datetime",
      ),
      col("member", "Done by", memberName("t.member_id")),
      ...stamps(),
    ],
  },
  inquiry_tasks: {
    from: `${SL}.inquiry_tasks t JOIN ${SL}.inquiries p ON p.id = t.inquiry_id`,
    workspace: "t.workspace_id",
    project: "p.project_id",
    date: "p.inquiry_date",
    live: ["t.deleted_at IS NULL", "p.deleted_at IS NULL"],
    id: "t.id",
    number: null,
    columns: [
      id(),
      col("inquiryId", "Inquiry ID", "t.inquiry_id::text", "id"),
      col("inquiry", "Inquiry", "p.name"),
      col("title", "Title", "t.title"),
      col("dueDate", "Due Date", "t.due_date", "date"),
      col("assignee", "Assignee", memberName("t.assignee_member_id")),
      col("status", "Status", "t.status::text", "enum"),
      col("doneAt", "Done on", "t.done_at", "datetime"),
      col("doneBy", "Done by", who("t.done_by")),
      ...stamps(),
      ...updated(),
    ],
  },
  unit_profiles: {
    from: `${SL}.unit_profiles t`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: null,
    live: [
      `EXISTS (SELECT 1 FROM ${PJ}.units u WHERE u.id = t.unit_id AND u.deleted_at IS NULL)`,
    ],
    id: "t.unit_id",
    number: null,
    columns: [
      col("unitId", "Unit ID", "t.unit_id::text", "id"),
      col("wing", "Wing", nameIn(`${PJ}.wings`, "t.wing_id")),
      col("unit", "Unit", nameIn(`${PJ}.units`, "t.unit_id")),
      col("unitType", "Unit type", "t.unit_type"),
      col("carpetArea", "Carpet area", "t.carpet_area", "number"),
      col("builtUpArea", "Built-up area", "t.built_up_area", "number"),
      col(
        "superBuiltUpArea",
        "Super built-up area",
        "t.super_built_up_area",
        "number",
      ),
      col("areaUnit", "Area unit", "t.area_unit::text", "enum"),
      col("unavailable", "Unavailable", "t.unavailable", "bool"),
      col(
        "unavailableReason",
        "Unavailable reason",
        "t.unavailable_reason::text",
        "enum",
      ),
      col("unavailableNote", "Note", "t.unavailable_note"),
      ...updated(),
    ],
  },
  inspections: {
    from: `${TR}.inspections t`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: "t.inspection_date",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: "t.number",
    columns: [
      id(),
      projectName(),
      col("number", "Inspection No.", "t.number"),
      col("inspectionDate", "Inspection Date", "t.inspection_date", "date"),
      col("inspectionTime", "Time", "t.inspection_time"),
      department(),
      contractor(),
      col("inspector", "Inspector", memberName("t.inspector_member_id")),
      col("workDescription", "Work", "t.work_description"),
      ...siteLocation(),
      col("status", "Status", "t.status::text", "enum"),
      ...decision(),
      col("rejectionReason", "Rejection Reason", "t.rejection_reason"),
      ...stamps(),
    ],
    media: documentFiles(`${TR}.document_files`, "inspection"),
  },
  inspection_observations: {
    from: `${TR}.inspection_observations t JOIN ${TR}.inspections p ON p.id = t.inspection_id`,
    workspace: "t.workspace_id",
    project: "p.project_id",
    date: "p.inspection_date",
    live: ["t.deleted_at IS NULL", "p.deleted_at IS NULL"],
    id: "t.id",
    number: null,
    columns: [
      id(),
      col("inspectionId", "Inspection ID", "t.inspection_id::text", "id"),
      col("inspectionNumber", "Inspection No.", "p.number"),
      col("body", "Observation", "t.body"),
      ...stamps(),
    ],
  },

  // Project files -----------------------------------------------------------
  drawings: {
    from: `${PJ}.drawings t`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: "t.created_at::date",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: "t.name",
    columns: [
      id(),
      projectName(),
      col("album", "Album", nameIn(`${PJ}.drawing_albums`, "t.album_id")),
      col("name", "Drawing", "t.name"),
      col(
        "latestRevision",
        "Latest Revision",
        `(SELECT MAX(r.revision) FROM ${PJ}.drawing_revisions r WHERE r.drawing_id = t.id AND r.deleted_at IS NULL)`,
        "number",
      ),
      ...stamps(),
    ],
    media: (workspaceId, ids) => Prisma.sql`
      SELECT f.drawing_id::text AS "recordId", f.file_key AS "fileKey",
             'R' || f.revision || ' - ' || f.file_name AS "fileName"
        FROM construction_projects.drawing_revisions f
       WHERE f.workspace_id = ${workspaceId}
         AND f.deleted_at IS NULL
         AND f.drawing_id = ANY(${[...ids]}::uuid[])
       ORDER BY f.revision`,
  },
  drawing_revisions: {
    from: `${PJ}.drawing_revisions t JOIN ${PJ}.drawings p ON p.id = t.drawing_id`,
    workspace: "t.workspace_id",
    project: "p.project_id",
    date: "t.created_at::date",
    live: ["t.deleted_at IS NULL", "p.deleted_at IS NULL"],
    id: "t.id",
    number: null,
    columns: [
      id(),
      col("drawingId", "Drawing ID", "t.drawing_id::text", "id"),
      col("drawing", "Drawing", "p.name"),
      col("revision", "Revision", "t.revision", "number"),
      col("fileName", "File", "t.file_name"),
      col("bytes", "Size (bytes)", "t.bytes", "number"),
      ...stamps(),
    ],
  },
  testing_reports: {
    from: `${PJ}.testing_reports t`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: "t.report_date",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: "t.name",
    columns: [
      id(),
      projectName(),
      col("item", "Testing Item", nameIn(`${PJ}.testing_items`, "t.item_id")),
      col("name", "Report", "t.name"),
      col("reportDate", "Report Date", "t.report_date", "date"),
      col("remark", "Remark", "t.remark"),
      col("fileName", "File", "t.file_name"),
      ...stamps(),
    ],
    media: ownFile(`${PJ}.testing_reports`),
  },
  gallery: {
    from: `${PJ}.media_items t`,
    workspace: "t.workspace_id",
    project: "t.project_id",
    date: "t.uploaded_at::date",
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: "t.source",
    columns: [
      id(),
      projectName(),
      col("source", "Module", "t.source", "enum"),
      col("sourceId", "Record ID", "t.source_id::text", "id"),
      col("fileName", "File", "t.file_name"),
      col("contentType", "Type", "t.content_type"),
      col("bytes", "Size (bytes)", "t.bytes", "number"),
      col("uploadedBy", "Uploaded by", who("t.uploaded_by")),
      col("uploadedAt", "Uploaded on", "t.uploaded_at", "datetime"),
    ],
    media: ownFile(`${PJ}.media_items`),
  },

  // Master records ----------------------------------------------------------
  team_members: master(`${OG}.team_members t`, [
    id(),
    col("name", "Name", "t.name"),
    col(
      "designation",
      "Designation",
      nameIn(`${OG}.designations`, "t.designation_id"),
    ),
    col("mobile", "Mobile", "t.mobile"),
    col("email", "Email", "t.email"),
    col("address", "Address", "t.address"),
    col(
      "aadhaar",
      "Aadhaar",
      "CASE WHEN t.aadhaar_last4 IS NULL THEN NULL ELSE 'XXXX XXXX ' || t.aadhaar_last4 END",
    ),
    col(
      "pan",
      "PAN",
      "CASE WHEN t.pan_last4 IS NULL THEN NULL ELSE 'XXXXXX' || t.pan_last4 END",
    ),
    col("emergencyContact", "Emergency Contact", "t.emergency_contact"),
    col("memberType", "Member Type", "t.member_type::text", "enum"),
    col("isOwner", "Owner", "t.is_owner", "bool"),
    col("status", "Status", "t.status::text", "enum"),
    col(
      "projects",
      "Projects",
      `(SELECT string_agg(x.name, ', ' ORDER BY x.name) FROM ${OG}.team_member_projects a JOIN ${PJ}.projects x ON x.id = a.project_id::uuid WHERE a.member_id = t.id AND x.deleted_at IS NULL)`,
    ),
    col("joinedAt", "Joined On", "t.joined_at", "datetime"),
    ...stamps(),
  ]),
  designations: master(`${OG}.designations t`, [
    id(),
    col("name", "Designation", "t.name"),
    col("isSeed", "Built in", "t.is_seed", "bool"),
    ...stamps(),
  ]),
  departments: simpleMaster(`${MS}.departments`, "Department"),
  contractors: master(`${MS}.contractors t`, [
    id(),
    col("name", "Contractor", "t.name"),
    col("contactPerson", "Contact Person", "t.contact_person"),
    col("mobile", "Mobile", "t.mobile"),
    col("email", "Email", "t.email"),
    col("address", "Address", "t.address"),
    col("gstin", "GSTIN", "t.gstin"),
    col("pan", "PAN", "t.pan"),
    col("stateCode", "State", "t.state_code"),
    col("tdsApplicable", "TDS Applicable", "t.tds_applicable", "bool"),
    col("tdsLowerRate", "Lower TDS %", "t.tds_lower_rate", "number"),
    col("isActive", "Active", "t.is_active", "bool"),
    ...stamps(),
  ]),
  suppliers: master(`${MS}.suppliers t`, [
    id(),
    col("name", "Supplier", "t.name"),
    col("contactPerson", "Contact Person", "t.contact_person"),
    col("mobile", "Mobile", "t.mobile"),
    col("email", "Email", "t.email"),
    col("address", "Address", "t.address"),
    col("gstin", "GSTIN", "t.gstin"),
    col("pan", "PAN", "t.pan"),
    col("stateCode", "State", "t.state_code"),
    col("isActive", "Active", "t.is_active", "bool"),
    ...stamps(),
  ]),
  vendors: master(`${LB}.vendors t`, [
    id(),
    col("name", "Vendor", "t.name"),
    col("joiningDate", "Joining Date", "t.joining_date", "date"),
    col("contactNumber", "Contact Number", "t.contact_number"),
    col("address", "Address", "t.address"),
    col("isActive", "Active", "t.is_active", "bool"),
    ...stamps(),
  ]),
  labours: master(`${LB}.labours t`, [
    id(),
    col("name", "Labour Name", "t.name"),
    col("labourCode", "Labour Code", "t.labour_code"),
    col("fatherName", "Father's Name", "t.father_name"),
    col("gender", "Gender", "t.gender::text", "enum"),
    col("joiningDate", "Joining Date", "t.joining_date", "date"),
    col(
      "labourCategory",
      "Labour Category",
      nameIn(`${MS}.labour_categories`, "t.labour_category_id"),
    ),
    col(
      "currentProject",
      "Current Project",
      nameIn(`${PJ}.projects`, "t.current_project_id"),
    ),
    col("wageType", "Wage Type", "t.wage_type::text", "enum"),
    money("wagePerDay", "Wage / Day (₹)", "t.wage_per_day"),
    money("wagePerMonth", "Wage / Month (₹)", "t.wage_per_month"),
    money("overtimeWagePerHour", "OT / Hour (₹)", "t.overtime_wage_per_hour"),
    col(
      "workingHoursPerDay",
      "Working Hours / Day",
      "t.working_hours_per_day",
      "number",
    ),
    col(
      "aadhaar",
      "Aadhaar",
      "CASE WHEN t.aadhaar_last4 IS NULL THEN NULL ELSE 'XXXX XXXX ' || t.aadhaar_last4 END",
    ),
    col("uanNumber", "UAN", "t.uan_number"),
    col("esicNumber", "ESIC", "t.esic_number"),
    col("contactNumber", "Contact Number", "t.contact_number"),
    col("isActive", "Active", "t.is_active", "bool"),
    ...stamps(),
  ]),
  labour_categories: master(`${MS}.labour_categories t`, [
    id(),
    col("name", "Labour Category", "t.name"),
    col("skill", "Skill", "t.skill::text", "enum"),
    col("disabled", "Disabled", "t.disabled_at IS NOT NULL", "bool"),
    ...stamps(),
  ]),
  equipments: master(`${SW}.equipment t`, [
    id(),
    col("name", "Equipment", "t.name"),
    col("equipmentNumber", "Equipment No.", "t.equipment_number"),
    col("ownership", "Ownership", "t.ownership::text", "enum"),
    col("purchaseYear", "Purchase Year", "t.purchase_year", "number"),
    col("fuelType", "Fuel", "t.fuel_type::text", "enum"),
    col(
      "utilisationBasis",
      "Utilisation Basis",
      "t.utilisation_basis::text",
      "enum",
    ),
    col(
      "workingTimeMethod",
      "Working Time",
      "t.working_time_method::text",
      "enum",
    ),
    col("companyName", "Hired From", "t.company_name"),
    col("hireBasis", "Hire Basis", "t.hire_basis::text", "enum"),
    money("hireRate", "Hire Rate (₹)", "t.hire_rate"),
    col(
      "currentProject",
      "Current Project",
      nameIn(`${PJ}.projects`, "t.current_project_id"),
    ),
    col("currentLocationName", "Location", "t.current_location_name"),
    ...stamps(),
  ]),
  material_categories: master(`${MS}.material_categories t`, [
    id(),
    col("name", "Material Category", "t.name"),
    col(
      "parent",
      "Parent Category",
      nameIn(`${MS}.material_categories`, "t.parent_id"),
    ),
    col("disabled", "Disabled", "t.disabled_at IS NOT NULL", "bool"),
    ...stamps(),
  ]),
  materials: master(`${MS}.materials t`, [
    id(),
    col("name", "Material", "t.name"),
    col("specification", "Specification", "t.specification"),
    unit("unit", "Unit", "t.uom_id"),
    col(
      "category",
      "Category",
      nameIn(`${MS}.material_categories`, "t.category_id"),
    ),
    col("itemType", "Item Type", "t.item_type::text", "enum"),
    money("unitRate", "Rate (₹)", "t.unit_rate"),
    col("discountType", "Discount Type", "t.discount_type::text", "enum"),
    col("discountPercent", "Discount %", "t.discount_percent", "number"),
    money("discountAmount", "Discount (₹)", "t.discount_amount"),
    col("gstRate", "GST %", "t.gst_rate", "number"),
    col("hsnCode", "HSN", "t.hsn_code"),
    col("minStockQty", "Minimum Stock", "t.min_stock_qty", "number"),
    col("disabled", "Disabled", "t.disabled_at IS NOT NULL", "bool"),
    ...stamps(),
  ]),
  measurement_units: simpleMaster(
    `${MS}.measurement_units`,
    "Measurement Unit",
  ),
  work_types: master(`${MS}.work_types t`, [
    id(),
    col("name", "Work Type", "t.name"),
    department(),
    col("disabled", "Disabled", "t.disabled_at IS NOT NULL", "bool"),
    ...stamps(),
  ]),
  terms_conditions: master(`${MS}.terms_conditions t`, [
    id(),
    col("title", "Title", "t.title"),
    col("body", "Terms", "t.body"),
    col("disabled", "Disabled", "t.disabled_at IS NOT NULL", "bool"),
    ...stamps(),
  ]),
  bank_accounts: master(`${FN}.accounts t`, [
    id(),
    col("name", "Account Name", "t.name"),
    col("kind", "Kind", "t.kind::text", "enum"),
    col("bankName", "Bank", "t.bank_name"),
    col("accountNumber", "Account No.", "t.account_number"),
    col("ifsc", "IFSC", "t.ifsc"),
    col("branch", "Branch", "t.branch"),
    col("holder", "Holder", memberName("t.holder_member_id")),
    col("isPrimary", "Primary", "t.is_primary", "bool"),
    col("openingDate", "Opening Date", "t.opening_date", "date"),
    ...stamps(),
  ]),
  payment_categories: simpleMaster(
    `${FN}.payment_categories`,
    "Payment Category",
  ),
  other_parties: master(`${FN}.other_parties t`, [
    id(),
    col("name", "Party", "t.name"),
    col("mobile", "Mobile", "t.mobile"),
    col("email", "Email", "t.email"),
    col("gstin", "GSTIN", "t.gstin"),
    col("pan", "PAN", "t.pan"),
    col("stateCode", "State", "t.state_code"),
    col("address", "Address", "t.address"),
    ...stamps(),
  ]),
  issue_categories: simpleMaster(`${MS}.issue_categories`, "Issue Category"),
  tags: master(`${MS}.tags t`, [
    id(),
    col("name", "Tag", "t.name"),
    ...stamps(),
  ]),

  // HRMS (Company-level) ------------------------------------------------------
  hrms_employees: master(`${OG}.team_members t`, [
    id(),
    col("name", "Employee", "t.name"),
    col(
      "designation",
      "Designation",
      nameIn(`${OG}.designations`, "t.designation_id"),
    ),
    col("memberType", "Member Type", "t.member_type::text", "enum"),
    col("status", "Status", "t.status::text", "enum"),
    col("mobile", "Mobile", "t.mobile"),
    col("email", "Email", "t.email"),
    col("address", "Address", "t.address"),
    col("aadhaar", "Aadhaar", AADHAAR()),
    col("pan", "PAN", PAN()),
    col("emergencyContact", "Emergency Contact", "t.emergency_contact"),
    col(
      "branches",
      "Branches",
      `(SELECT string_agg(b.name, ', ' ORDER BY b.name) FROM ${HR}.member_branches a JOIN ${HR}.branches b ON b.id = a.branch_id WHERE a.member_id = t.id AND b.deleted_at IS NULL)`,
    ),
    col(
      "gender",
      "Gender",
      `(SELECT c.gender::text FROM ${HR}.employee_salary_configs c WHERE c.member_id = t.id AND c.deleted_at IS NULL ORDER BY c.effective_from DESC LIMIT 1)`,
      "enum",
    ),
    col(
      "uan",
      "UAN",
      `(SELECT c.uan FROM ${HR}.employee_salary_configs c WHERE c.member_id = t.id AND c.deleted_at IS NULL ORDER BY c.effective_from DESC LIMIT 1)`,
    ),
    col(
      "esiIpNumber",
      "ESI IP No.",
      `(SELECT c.esi_ip_number FROM ${HR}.employee_salary_configs c WHERE c.member_id = t.id AND c.deleted_at IS NULL ORDER BY c.effective_from DESC LIMIT 1)`,
    ),
    col("joinedAt", "Joined On", "t.joined_at", "datetime"),
    ...stamps(),
  ]),
  hrms_branches: master(`${HR}.branches t`, [
    id(),
    col("name", "Branch", "t.name"),
    col("kind", "Kind", "t.kind::text", "enum"),
    col("address", "Address", "t.address"),
    projectName(),
    col("latitude", "Latitude", "t.latitude", "number"),
    col("longitude", "Longitude", "t.longitude", "number"),
    col("radiusMetres", "Radius (m)", "t.radius_metres", "number"),
    ...stamps(),
  ]),
  hrms_settings: {
    ...master(`${HR}.settings t`, [
      id(),
      col("gpsRequirement", "GPS", "t.gps_requirement::text", "enum"),
      col("graceMinutes", "Grace (min)", "t.grace_minutes", "number"),
      col(
        "workingHoursPerDay",
        "Working Hours / Day",
        "t.working_hours_per_day",
        "number",
      ),
      col("halfDayHours", "Half Day Hours", "t.half_day_hours", "number"),
      col("workingDays", "Working Days", "t.working_days", "json"),
      col(
        "leaveApprovalLevels",
        "Leave Approval Levels",
        "t.leave_approval_levels",
        "number",
      ),
      col("leaveYear", "Leave Year", "t.leave_year::text", "enum"),
      col(
        "carryForwardEnabled",
        "Carry Forward",
        "t.carry_forward_enabled",
        "bool",
      ),
      col(
        "autoSalaryCalculation",
        "Auto Salary",
        "t.auto_salary_calculation",
        "bool",
      ),
      col("ptStateCode", "PT State", "t.pt_state_code"),
      ...updated(),
    ]),
    live: [],
  },
  hrms_shift_templates: master(`${HR}.shift_templates t`, [
    id(),
    col("name", "Shift", "t.name"),
    col("startTime", "Start", "t.start_time"),
    col("endTime", "End", "t.end_time"),
    col("workingDays", "Working Days", "t.working_days", "json"),
    col("workingHours", "Working Hours", "t.working_hours", "number"),
    col("halfDayHours", "Half Day Hours", "t.half_day_hours", "number"),
    col("graceMinutes", "Grace (min)", "t.grace_minutes", "number"),
    col("overtimeAllowed", "Overtime", "t.overtime_allowed", "bool"),
    col("isActive", "Active", "t.is_active", "bool"),
    ...stamps(),
  ]),
  hrms_rotation_templates: master(`${HR}.rotation_templates t`, [
    id(),
    col("name", "Rotation", "t.name"),
    col("rotationType", "Type", "t.rotation_type::text", "enum"),
    col("daysPerCycle", "Days per Cycle", "t.days_per_cycle", "number"),
    col(
      "slots",
      "Slots",
      `(SELECT string_agg(CASE WHEN r.is_week_off THEN 'Week off' ELSE COALESCE(st.name, '-') END, ' → ' ORDER BY r.position) FROM ${HR}.rotation_slots r LEFT JOIN ${HR}.shift_templates st ON st.id = r.shift_template_id WHERE r.rotation_id = t.id)`,
    ),
    col("isActive", "Active", "t.is_active", "bool"),
    ...stamps(),
  ]),
  hrms_shift_assignments: {
    ...master(`${HR}.shift_assignments t`, [
      id(),
      employee(),
      col(
        "shift",
        "Shift",
        nameIn(`${HR}.shift_templates`, "t.shift_template_id"),
      ),
      col(
        "rotation",
        "Rotation",
        nameIn(`${HR}.rotation_templates`, "t.rotation_template_id"),
      ),
      col("effectiveFrom", "From", "t.effective_from", "date"),
      col("effectiveTo", "To", "t.effective_to", "date"),
      ...stamps(),
    ]),
    date: "t.effective_from",
  },
  hrms_holidays: {
    ...master(`${HR}.holidays t`, [
      id(),
      col("name", "Holiday", "t.name"),
      col("holidayDate", "Date", "t.holiday_date", "date"),
      col("type", "Type", "t.type::text", "enum"),
      col("isOptional", "Optional", "t.is_optional", "bool"),
      col("description", "Description", "t.description"),
      ...stamps(),
    ]),
    date: "t.holiday_date",
  },
  hrms_attendance_entries: {
    ...master(`${HR}.attendance_entries t`, [
      id(),
      employee(),
      col("attendanceDate", "Date", "t.attendance_date", "date"),
      col("checkInAt", "Check In", "t.check_in_at", "datetime"),
      col(
        "checkInBranch",
        "Check-in Branch",
        nameIn(`${HR}.branches`, "t.check_in_branch_id"),
      ),
      col(
        "checkInLatitude",
        "Check-in Latitude",
        "t.check_in_latitude",
        "number",
      ),
      col(
        "checkInLongitude",
        "Check-in Longitude",
        "t.check_in_longitude",
        "number",
      ),
      col("checkOutAt", "Check Out", "t.check_out_at", "datetime"),
      col(
        "checkOutBranch",
        "Check-out Branch",
        nameIn(`${HR}.branches`, "t.check_out_branch_id"),
      ),
      col(
        "checkOutLatitude",
        "Check-out Latitude",
        "t.check_out_latitude",
        "number",
      ),
      col(
        "checkOutLongitude",
        "Check-out Longitude",
        "t.check_out_longitude",
        "number",
      ),
      col("source", "Source", "t.source::text", "enum"),
      col("outOfFence", "Outside the Branch", "t.out_of_fence", "bool"),
      col("reason", "Correction Reason", "t.reason"),
      approval(),
      ...decision(),
      col("rejectionReason", "Rejection Reason", "t.rejection_reason"),
      ...stamps(),
    ]),
    date: "t.attendance_date",
  },
  hrms_leave_types: master(`${HR}.leave_types t`, [
    id(),
    col("name", "Leave Type", "t.name"),
    col("yearlyLimit", "Yearly Limit", "t.yearly_limit", "number"),
    col("isPaid", "Paid", "t.is_paid", "bool"),
    col("requiresApproval", "Needs Approval", "t.requires_approval", "bool"),
    col(
      "maxConsecutiveDays",
      "Max Consecutive Days",
      "t.max_consecutive_days",
      "number",
    ),
    col("carryForward", "Carry Forward", "t.carry_forward", "bool"),
    col(
      "maxCarryForward",
      "Max Carry Forward",
      "t.max_carry_forward",
      "number",
    ),
    col("accrualMode", "Accrual", "t.accrual_mode::text", "enum"),
    col("isActive", "Active", "t.is_active", "bool"),
    ...stamps(),
  ]),
  hrms_leave_balances: {
    from: `(SELECT md5(l.member_id::text || ':' || l.leave_type_id::text || ':' || l.leave_year)::uuid AS id,
                   l.workspace_id, l.member_id, l.leave_type_id, l.leave_year,
                   SUM(l.days) AS days,
                   SUM(l.days) FILTER (WHERE l.kind::text = 'used') AS used
              FROM ${HR}.leave_ledger_entries l
             GROUP BY l.workspace_id, l.member_id, l.leave_type_id, l.leave_year) t`,
    workspace: "t.workspace_id",
    project: null,
    date: null,
    live: [],
    id: "t.id",
    number: null,
    columns: [
      employee(),
      col(
        "leaveType",
        "Leave Type",
        nameIn(`${HR}.leave_types`, "t.leave_type_id"),
      ),
      col("leaveYear", "Leave Year", "t.leave_year"),
      col("used", "Used", "-COALESCE(t.used, 0)", "number"),
      col("balance", "Balance", "t.days", "number"),
    ],
  },
  hrms_leave_ledger: {
    ...master(`${HR}.leave_ledger_entries t`, [
      id(),
      employee(),
      col(
        "leaveType",
        "Leave Type",
        nameIn(`${HR}.leave_types`, "t.leave_type_id"),
      ),
      col("leaveYear", "Leave Year", "t.leave_year"),
      col("entryDate", "Date", "t.entry_date", "date"),
      col("kind", "Entry", "t.kind::text", "enum"),
      col("days", "Days", "t.days", "number"),
      col("reason", "Reason", "t.reason"),
      col("requestId", "Request ID", "t.request_id::text", "id"),
      ...stamps(),
    ]),
    live: [],
    date: "t.entry_date",
  },
  hrms_leave_requests: {
    ...master(`${HR}.leave_requests t`, [
      id(),
      employee(),
      col(
        "leaveType",
        "Leave Type",
        nameIn(`${HR}.leave_types`, "t.leave_type_id"),
      ),
      col("fromDate", "From", "t.from_date", "date"),
      col("toDate", "To", "t.to_date", "date"),
      col("totalDays", "Days", "t.total_days", "number"),
      col("leaveYear", "Leave Year", "t.leave_year"),
      col("reason", "Reason", "t.reason"),
      col("status", "Status", "t.status::text", "enum"),
      col("approvalRemarks", "Approval Remarks", "t.approval_remarks"),
      col("rejectionReason", "Rejection Reason", "t.rejection_reason"),
      col("cancellationReason", "Cancellation Reason", "t.cancellation_reason"),
      col("appliedBy", "Applied By", memberName("t.applied_by_member_id")),
      ...stamps(),
    ]),
    live: [],
    date: "t.from_date",
  },
  hrms_salary_structures: master(`${HR}.salary_structures t`, [
    id(),
    col("name", "Salary Structure", "t.name"),
    col("description", "Description", "t.description"),
    col("pfApplicable", "PF", "t.pf_applicable", "bool"),
    col(
      "pfEmployeePercent",
      "PF Employee %",
      "t.pf_employee_percent",
      "number",
    ),
    money("pfWageCeiling", "PF Wage Ceiling (₹)", "t.pf_wage_ceiling"),
    col("esiApplicable", "ESI", "t.esi_applicable", "bool"),
    col(
      "esiEmployeePercent",
      "ESI Employee %",
      "t.esi_employee_percent",
      "number",
    ),
    col("ptApplicable", "PT", "t.pt_applicable", "bool"),
    money("ptMonthlyAmount", "PT / Month (₹)", "t.pt_monthly_amount"),
    col(
      "deductAbsentDays",
      "Deduct Absent Days",
      "t.deduct_absent_days",
      "bool",
    ),
    col(
      "deductUnpaidLeave",
      "Deduct Unpaid Leave",
      "t.deduct_unpaid_leave",
      "bool",
    ),
    col("isActive", "Active", "t.is_active", "bool"),
    ...stamps(),
  ]),
  hrms_salary_components: {
    from: `${HR}.salary_components t JOIN ${HR}.salary_structures p ON p.id = t.structure_id`,
    workspace: "p.workspace_id",
    project: null,
    date: null,
    live: ["p.deleted_at IS NULL"],
    id: "t.id",
    number: null,
    columns: [
      id(),
      col("structure", "Salary Structure", "p.name"),
      col("name", "Component", "t.name"),
      col("basis", "Basis", "t.basis::text", "enum"),
      money("amount", "Amount (₹)", "t.amount"),
      col("percent", "Percent", "t.percent", "number"),
      col("isBalancing", "Balancing", "t.is_balancing", "bool"),
      col("countsForPfWage", "Counts for PF", "t.counts_for_pf_wage", "bool"),
    ],
  },
  hrms_employee_salary_configs: master(`${HR}.employee_salary_configs t`, [
    id(),
    employee(),
    col(
      "structure",
      "Salary Structure",
      nameIn(`${HR}.salary_structures`, "t.structure_id"),
    ),
    money("baseMonthly", "Monthly Salary (₹)", "t.base_monthly"),
    col("effectiveFrom", "From", "t.effective_from", "date"),
    ...stamps(),
  ]),
  hrms_salary_slips: {
    ...master(`${HR}.salary_slips t`, [
      id(),
      employee(),
      col("month", "Month", "t.month"),
      col("kind", "Kind", "t.kind::text", "enum"),
      col("status", "Status", "t.status::text", "enum"),
      col(
        "structure",
        "Salary Structure",
        nameIn(`${HR}.salary_structures`, "t.structure_id"),
      ),
      col("daysInMonth", "Days in Month", "t.days_in_month", "number"),
      col("presentDays", "Present", "t.present_days", "number"),
      col("absentDays", "Absent", "t.absent_days", "number"),
      col("halfDays", "Half Days", "t.half_days", "number"),
      col("paidLeaveDays", "Paid Leave", "t.paid_leave_days", "number"),
      col("unpaidLeaveDays", "Unpaid Leave", "t.unpaid_leave_days", "number"),
      col("payableDays", "Payable Days", "t.payable_days", "number"),
      col("overtimeHours", "OT Hours", "t.overtime_hours", "number"),
      money("baseMonthly", "Monthly Salary (₹)", "t.base_monthly"),
      money("overtimePay", "OT Pay (₹)", "t.overtime_pay"),
      money("grossEarnings", "Gross (₹)", "t.gross_earnings"),
      money("pfEmployee", "PF (₹)", "t.pf_employee"),
      money("esiEmployee", "ESI (₹)", "t.esi_employee"),
      money("professionalTax", "PT (₹)", "t.professional_tax"),
      money("absentDeduction", "Absent Deduction (₹)", "t.absent_deduction"),
      money(
        "unpaidLeaveDeduction",
        "Unpaid Leave Deduction (₹)",
        "t.unpaid_leave_deduction",
      ),
      money("otherDeductions", "Other Deductions (₹)", "t.other_deductions"),
      money("advanceRecovered", "Advance Recovered (₹)", "t.advance_recovered"),
      money("netPayable", "Net Payable (₹)", "t.net_payable"),
      money("pfEmployer", "PF Employer (₹)", "t.pf_employer"),
      money("esiEmployer", "ESI Employer (₹)", "t.esi_employer"),
      col("approvedBy", "Approved by", who("t.approved_by")),
      col("approvedAt", "Approved on", "t.approved_at", "datetime"),
      ...stamps(),
    ]),
    date: "to_date(t.month || '-01', 'YYYY-MM-DD')",
  },
  hrms_salary_payments: {
    ...master(`${HR}.salary_slips t`, [
      id(),
      employee(),
      col("month", "Month", "t.month"),
      col("paymentDate", "Paid On", "t.payment_date", "date"),
      col("paymentMode", "Mode", "t.payment_mode::text", "enum"),
      col("paymentReference", "Reference", "t.payment_reference"),
      account("paidFromAccount", "Paid From", "t.paid_from_account_id"),
      money("netPayable", "Amount (₹)", "t.net_payable"),
      col("paidBy", "Paid by", who("t.paid_by")),
      col("paidAt", "Recorded on", "t.paid_at", "datetime"),
    ]),
    live: ["t.deleted_at IS NULL", "t.paid_at IS NOT NULL"],
    date: "t.payment_date",
  },

  // Company settings --------------------------------------------------------
  company_profile: master(`${OG}.company_profiles t`, [
    id(),
    col("name", "Company Name", "t.name"),
    col("mobile", "Mobile", "t.mobile"),
    col("email", "Email", "t.email"),
    col("country", "Country", "t.country"),
    col("gstin", "GSTIN", "t.gstin"),
    col("pan", "PAN", "t.pan"),
    col("address", "Address", "t.address"),
    col("currency", "Currency", "t.currency"),
    col("timezone", "Time Zone", "t.timezone"),
    ...stamps(),
  ]),
  billing_addresses: master(`${OG}.billing_addresses t`, [
    id(),
    col("name", "Name", "t.name"),
    col("address", "Address", "t.address"),
    col("stateCode", "State", "t.state_code"),
    col("gstin", "GSTIN", "t.gstin"),
    col("isDefault", "Default", "t.is_default", "bool"),
    ...stamps(),
  ]),
  sequence_rules: master(`${OG}.sequence_rules t`, [
    id(),
    col("module", "Module", "t.module", "enum"),
    projectName(),
    col("prefix", "Prefix", "t.prefix"),
    col("projectToken", "Project Code", "t.project_token"),
    col("startNumber", "Start Number", "t.start_number", "number"),
    col("padding", "Digits", "t.padding", "number"),
    col("separator", "Separator", "t.separator"),
    col("fiscalYearToken", "Financial Year", "t.fiscal_year_token", "bool"),
    ...stamps(),
  ]),
  backdated_entry_policy: {
    ...master(`${OG}.backdated_entry_policies t`, [
      id(),
      col("createDays", "Create up to (days back)", "t.create_days", "number"),
      col("editDays", "Edit up to (days back)", "t.edit_days", "number"),
      col(
        "financialClosingDate",
        "Financial Closing Date",
        "t.financial_closing_date",
        "date",
      ),
      col("modules", "Per module", "t.modules", "json"),
      ...updated(),
    ]),
    live: [],
  },
  stores: master(`${PR}.stores t`, [
    id(),
    col("name", "Store", "t.name"),
    col("address", "Address", "t.address"),
    col("stateCode", "State", "t.state_code"),
    col(
      "projects",
      "Projects",
      `(SELECT string_agg(x.name, ', ' ORDER BY x.name) FROM ${PR}.store_projects a JOIN ${PJ}.projects x ON x.id = a.project_id WHERE a.store_id = t.id)`,
    ),
    ...stamps(),
  ]),
};

/** A Company-level entity: its own tombstone, no Project, no date. */
function master(from: string, columns: readonly Column[]): EntitySpec {
  return {
    from,
    workspace: "t.workspace_id",
    project: null,
    date: null,
    live: ["t.deleted_at IS NULL"],
    id: "t.id",
    number: null,
    columns,
  };
}

/** A name-only master with `is_seed` and `disabled_at`. */
function simpleMaster(table: string, label: string): EntitySpec {
  return master(`${table} t`, [
    id(),
    col("name", label, "t.name"),
    col("isSeed", "Built in", "t.is_seed", "bool"),
    col("disabled", "Disabled", "t.disabled_at IS NOT NULL", "bool"),
    ...stamps(),
  ]);
}

function specOf(entity: string): EntitySpec {
  const spec = SPECS[entity];
  if (spec == null) throw new Error(`No backup reader for ${entity}.`);
  return spec;
}

function columnsOf(spec: EntitySpec, includesMoney: boolean): Column[] {
  return spec.columns.filter(
    (column) => includesMoney || column.money !== true,
  );
}

type PageRow = Record<string, BackupRawValue> & {
  __id: string;
  __number: string | null;
};

/** The backup readers over Prisma (every entity of the registry). */
export function createBackupEntityReader(
  db: Pick<PrismaClient, "$queryRaw"> = prisma,
): BackupEntityReader {
  return {
    columns(entity, includesMoney) {
      return columnsOf(specOf(entity), includesMoney).map(
        ({ field, label, type }) => ({ field, label, type }),
      );
    },

    async page(entity, scope, after, limit) {
      const spec = specOf(entity);
      // Every column is read; money columns are dropped by the writer.
      const select = Prisma.join(
        [
          Prisma.raw(`${spec.id}::text AS "__id"`),
          Prisma.raw(`${spec.number ?? "NULL"}::text AS "__number"`),
          ...spec.columns.map((column) =>
            Prisma.raw(`${column.sql} AS "${column.field}"`),
          ),
        ],
        ", ",
      );
      const conditions: Prisma.Sql[] = [
        Prisma.sql`${Prisma.raw(spec.workspace)} = ${scope.workspaceId}`,
        ...spec.live.map((live) => Prisma.raw(live)),
      ];
      if (spec.project != null && scope.projectId != null)
        conditions.push(
          Prisma.sql`(${Prisma.raw(spec.project)})::text = ${scope.projectId}`,
        );
      if (
        entity === "material_transfers" ||
        entity === "material_transfer_items"
      ) {
        if (scope.projectId != null) {
          const alias = entity === "material_transfers" ? "t" : "p";
          conditions.push(
            Prisma.sql`(${Prisma.raw(`${alias}.from_id`)}::text = ${scope.projectId} OR ${Prisma.raw(`${alias}.to_id`)}::text = ${scope.projectId})`,
          );
        }
      }
      if (spec.date != null && scope.fromDate != null)
        conditions.push(
          Prisma.sql`(${Prisma.raw(spec.date)})::date >= ${scope.fromDate}::date`,
        );
      if (spec.date != null && scope.toDate != null)
        conditions.push(
          Prisma.sql`(${Prisma.raw(spec.date)})::date <= ${scope.toDate}::date`,
        );
      if (after != null)
        conditions.push(Prisma.sql`${Prisma.raw(spec.id)} > ${after}::uuid`);
      const rows = await db.$queryRaw<PageRow[]>(Prisma.sql`
        SELECT ${select}
          FROM ${Prisma.raw(spec.from)}
         WHERE ${Prisma.join(conditions, " AND ")}
         ORDER BY ${Prisma.raw(spec.id)}
         LIMIT ${limit}`);
      return rows.map((row): BackupRow => {
        const { __id, __number, ...values } = row;
        return { id: __id, number: __number, values };
      });
    },

    async media(entity, workspaceId, recordIds) {
      const spec = specOf(entity);
      if (spec.media == null || recordIds.length === 0) return [];
      return db.$queryRaw<BackupMediaFile[]>(
        spec.media(workspaceId, recordIds),
      );
    },
  };
}

/** Every entity the registry names has a reader (checked by a test). */
export function missingBackupReaders(): string[] {
  return BACKUP_ENTITY_KEYS.filter((entity) => SPECS[entity] == null);
}

// ---------------------------------------------------------------------------
// Download My Data
// ---------------------------------------------------------------------------

const PROFILE_COLUMNS: BackupColumn[] = [
  { field: "id", label: "User ID", type: "id" },
  { field: "name", label: "Name", type: "text" },
  { field: "email", label: "Email", type: "text" },
  { field: "emailVerified", label: "Email verified", type: "bool" },
  { field: "phoneNumber", label: "Mobile", type: "text" },
  { field: "createdAt", label: "Signed up on", type: "datetime" },
];

const MEMBERSHIP_COLUMNS: BackupColumn[] = [
  { field: "companyId", label: "Company ID", type: "id" },
  { field: "company", label: "Company", type: "text" },
  { field: "role", label: "Role", type: "enum" },
  { field: "teamMemberId", label: "Team Member ID", type: "id" },
  { field: "name", label: "Name", type: "text" },
  { field: "designation", label: "Designation", type: "text" },
  { field: "mobile", label: "Mobile", type: "text" },
  { field: "email", label: "Email", type: "text" },
  { field: "address", label: "Address", type: "text" },
  { field: "aadhaar", label: "Aadhaar", type: "text" },
  { field: "pan", label: "PAN", type: "text" },
  { field: "emergencyContact", label: "Emergency Contact", type: "text" },
  { field: "status", label: "Status", type: "enum" },
  { field: "joinedAt", label: "Joined On", type: "datetime" },
];

const DEVICE_COLUMNS: BackupColumn[] = [
  { field: "id", label: "Session ID", type: "id" },
  { field: "userAgent", label: "Browser", type: "text" },
  { field: "createdAt", label: "Signed in on", type: "datetime" },
  { field: "updatedAt", label: "Last active", type: "datetime" },
  { field: "expiresAt", label: "Expires on", type: "datetime" },
];

const NOTIFICATION_COLUMNS: BackupColumn[] = [
  { field: "id", label: "ID", type: "id" },
  { field: "companyId", label: "Company ID", type: "id" },
  { field: "type", label: "Kind", type: "text" },
  { field: "title", label: "Title", type: "text" },
  { field: "body", label: "Text", type: "text" },
  { field: "createdAt", label: "Sent on", type: "datetime" },
  { field: "readAt", label: "Read on", type: "datetime" },
];

const AUDIT_COLUMNS: BackupColumn[] = [
  { field: "id", label: "ID", type: "id" },
  { field: "companyId", label: "Company ID", type: "id" },
  { field: "action", label: "Action", type: "text" },
  { field: "entityType", label: "Record type", type: "text" },
  { field: "entityId", label: "Record ID", type: "id" },
  { field: "occurredAt", label: "When", type: "datetime" },
];

/**
 * Download My Data (ADR CM-0021 §8): the User's identity profile, their
 * memberships and Team Member records in each Company (Aadhaar and PAN
 * masked), their signed-in devices, notifications and the audit events
 * they caused. Identity comes through `@repo/auth`; the rest are plain
 * reads by their User id.
 */
export function createMyDataReader(): MyDataReader {
  return {
    async read(userId) {
      const [profile, memberships, sessions] = await Promise.all([
        accounts.profile(userId),
        companies.listForUser(userId),
        accounts.listSessions(userId),
      ]);
      const members = await prisma.$queryRaw<Record<string, BackupRawValue>[]>(
        Prisma.sql`
          SELECT t.workspace_id AS "companyId", t.id::text AS "teamMemberId",
                 t.name, d.name AS designation, t.mobile, t.email, t.address,
                 CASE WHEN t.aadhaar_last4 IS NULL THEN NULL ELSE 'XXXX XXXX ' || t.aadhaar_last4 END AS aadhaar,
                 CASE WHEN t.pan_last4 IS NULL THEN NULL ELSE 'XXXXXX' || t.pan_last4 END AS pan,
                 t.emergency_contact AS "emergencyContact", t.status::text AS status,
                 t.joined_at AS "joinedAt"
            FROM construction_organization.team_members t
            LEFT JOIN construction_organization.designations d ON d.id = t.designation_id
           WHERE t.user_id = ${userId} AND t.deleted_at IS NULL
           ORDER BY t.created_at`,
      );
      const byCompany = new Map(memberships.map((m) => [m.id, m]));
      const seen = new Set<string>();
      const membershipRows: Record<string, BackupRawValue>[] = members.map(
        (member) => {
          const companyId = String(member["companyId"]);
          seen.add(companyId);
          const company = byCompany.get(companyId);
          return {
            ...member,
            company: company?.name ?? null,
            role: company?.role ?? null,
          };
        },
      );
      for (const company of memberships)
        if (!seen.has(company.id))
          membershipRows.push({
            companyId: company.id,
            company: company.name,
            role: company.role,
          });
      const [notifications, audit] = await Promise.all([
        prisma.constructionMessagingNotification.findMany({
          where: { recipientUserId: userId, deletedAt: null },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            workspaceId: true,
            type: true,
            title: true,
            body: true,
            createdAt: true,
            readAt: true,
          },
        }),
        prisma.constructionOrganizationAuditEvent.findMany({
          where: { actorUserId: userId },
          orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            workspaceId: true,
            action: true,
            entityType: true,
            entityId: true,
            occurredAt: true,
          },
        }),
      ]);
      return [
        {
          entity: "profile",
          columns: PROFILE_COLUMNS,
          rows: profile == null ? [] : [{ ...profile }],
        },
        {
          entity: "companies",
          columns: MEMBERSHIP_COLUMNS,
          rows: membershipRows,
        },
        {
          entity: "devices",
          columns: DEVICE_COLUMNS,
          rows: sessions.map((session) => ({ ...session })),
        },
        {
          entity: "notifications",
          columns: NOTIFICATION_COLUMNS,
          rows: notifications.map(({ workspaceId, ...row }) => ({
            ...row,
            companyId: workspaceId,
          })),
        },
        {
          entity: "audit_events",
          columns: AUDIT_COLUMNS,
          rows: audit.map(({ workspaceId, ...row }) => ({
            ...row,
            companyId: workspaceId,
          })),
        },
      ];
    },
  };
}

/** Names for the manifest: plain reads. */
export const backupNames: BackupNames = {
  async company(workspaceId) {
    const row = await prisma.constructionOrganizationCompanyProfile.findFirst({
      where: { workspaceId },
      select: { name: true },
    });
    return row?.name ?? null;
  },
  async project(workspaceId, projectId) {
    const row = await prisma.constructionProjectsProject.findFirst({
      where: { id: projectId, workspaceId },
      select: { name: true },
    });
    return row?.name ?? null;
  },
  async user(userId) {
    const profile = await accounts.profile(userId);
    return profile?.name ?? null;
  },
};
