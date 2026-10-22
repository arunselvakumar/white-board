/**
 * The contracts context's fixed words (ADR CM-0023 §3–§10), in the order
 * screens show them. Values match the `construction_contracts` enums; a unit
 * test keeps them in step with the Prisma schema.
 */

/** A rate analysis line's resource (CM-0023 §3). */
export const ANALYSIS_KINDS = [
  "material",
  "labour",
  "equipment",
  "lump_sum",
] as const;
export type AnalysisKind = (typeof ANALYSIS_KINDS)[number];
export const ANALYSIS_KIND_LABELS: Record<AnalysisKind, string> = {
  material: "Material",
  labour: "Labour",
  equipment: "Equipment",
  lump_sum: "Lump sum",
};

/**
 * Which way a measurement or bill goes (CM-0023 §6, §7): the Client side is
 * measured against the BOQ and billed to the Project's Client; the
 * Contractor side against a Work Order and billed by its Contractor.
 */
export const SIDES = ["client", "contractor"] as const;
export type Side = (typeof SIDES)[number];
export const SIDE_LABELS: Record<Side, string> = {
  client: "Client",
  contractor: "Contractor",
};
/** What a bill on each side is called on screens. */
export const BILL_SIDE_LABELS: Record<Side, string> = {
  client: "Client Bill",
  contractor: "Contractor Bill",
};

/** What a Variation changes on the BOQ (CM-0023 §4). */
export const VARIATION_KINDS = ["extra_item", "quantity", "rate"] as const;
export type VariationKind = (typeof VARIATION_KINDS)[number];
export const VARIATION_KIND_LABELS: Record<VariationKind, string> = {
  extra_item: "Extra item",
  quantity: "Change of quantity",
  rate: "Change of rate",
};

/** Variations are approved with the BOQ menu's Approve flag (CM-0023 §4). */
export const VARIATION_STATUSES = [
  "pending_approval",
  "approved",
  "rejected",
] as const;
export type VariationStatus = (typeof VARIATION_STATUSES)[number];
export const VARIATION_STATUS_LABELS: Record<VariationStatus, string> = {
  pending_approval: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
};

/**
 * A Work Order's life (CM-0023 §5). An amendment keeps it Issued and adds
 * a revision.
 */
export const WORK_ORDER_STATUSES = [
  "draft",
  "pending_approval",
  "issued",
  "closed",
  "cancelled",
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];
export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  issued: "Issued",
  closed: "Closed",
  cancelled: "Cancelled",
};

/** A Work Order line: a BOQ item at the work-order rate, or work outside the BOQ. */
export const WORK_ORDER_LINE_KINDS = ["boq", "non_boq"] as const;
export type WorkOrderLineKind = (typeof WORK_ORDER_LINE_KINDS)[number];
export const WORK_ORDER_LINE_KIND_LABELS: Record<WorkOrderLineKind, string> = {
  boq: "BOQ item",
  non_boq: "Non-BOQ item",
};

/** How the Company issues a material to a Contractor (CM-0023 §10). */
export const ISSUE_BASES = ["free", "at_cost"] as const;
export type IssueBasis = (typeof ISSUE_BASES)[number];
export const ISSUE_BASIS_LABELS: Record<IssueBasis, string> = {
  free: "Free issue",
  at_cost: "At cost",
};

/**
 * A measurement sheet's state (CM-0023 §6). Checking it is the Joint
 * measurement (JMR) with the other party.
 */
export const MEASUREMENT_STATUSES = ["draft", "submitted", "checked"] as const;
export type MeasurementStatus = (typeof MEASUREMENT_STATUSES)[number];
export const MEASUREMENT_STATUS_LABELS: Record<MeasurementStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  checked: "Checked (Joint measurement)",
};

/** RA bills and escalation bills share one engine (CM-0023 §7, §9). */
export const BILL_TYPES = ["running", "escalation"] as const;
export type BillType = (typeof BILL_TYPES)[number];
export const BILL_TYPE_LABELS: Record<BillType, string> = {
  running: "RA bill",
  escalation: "Escalation bill",
};

/**
 * A bill's life (CM-0023 §7). A reversed bill keeps its row and frees its
 * measurements.
 */
export const BILL_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "reversed",
] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];
export const BILL_STATUS_LABELS: Record<BillStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
  reversed: "Reversed",
};

/**
 * Typed deductions on a bill (CM-0023 §7). TDS is not one: finance deducts
 * it at payment (CM-0017).
 */
export const DEDUCTION_KINDS = [
  "retention",
  "mobilisation_recovery",
  "secured_advance_recovery",
  "material_at_cost",
  "material_reconciliation",
  "other",
] as const;
export type DeductionKind = (typeof DEDUCTION_KINDS)[number];
export const DEDUCTION_KIND_LABELS: Record<DeductionKind, string> = {
  retention: "Retention",
  mobilisation_recovery: "Mobilisation advance recovery",
  secured_advance_recovery: "Secured advance recovery",
  material_at_cost: "Material issued at cost",
  material_reconciliation: "Material reconciliation recovery",
  other: "Other",
};

/**
 * An advance is given to a Contractor on a Work Order, or received from
 * the Client on the client contract (CM-0023 §8).
 */
export const ADVANCE_DIRECTIONS = ["given", "received"] as const;
export type AdvanceDirection = (typeof ADVANCE_DIRECTIONS)[number];
export const ADVANCE_DIRECTION_LABELS: Record<AdvanceDirection, string> = {
  given: "Given",
  received: "Received",
};

export const ADVANCE_KINDS = ["mobilisation", "secured"] as const;
export type AdvanceKind = (typeof ADVANCE_KINDS)[number];
export const ADVANCE_KIND_LABELS: Record<AdvanceKind, string> = {
  mobilisation: "Mobilisation advance",
  secured: "Secured advance",
};

/** How an advance is recovered from later bills (CM-0023 §8). */
export const RECOVERY_MODES = ["percent", "fixed"] as const;
export type RecoveryMode = (typeof RECOVERY_MODES)[number];
export const RECOVERY_MODE_LABELS: Record<RecoveryMode, string> = {
  percent: "% of each bill",
  fixed: "Fixed amount per bill",
};

/** What a bank guarantee secures (CM-0023 §8). */
export const GUARANTEE_PURPOSES = [
  "advance",
  "retention",
  "performance",
] as const;
export type GuaranteePurpose = (typeof GUARANTEE_PURPOSES)[number];
export const GUARANTEE_PURPOSE_LABELS: Record<GuaranteePurpose, string> = {
  advance: "Advance",
  retention: "Retention",
  performance: "Performance",
};

/** When retention is released (CM-0023 §8). */
export const RETENTION_STAGES = [
  "completion",
  "dlp_end",
  "bank_guarantee",
  "other",
] as const;
export type RetentionStage = (typeof RETENTION_STAGES)[number];
export const RETENTION_STAGE_LABELS: Record<RetentionStage, string> = {
  completion: "On completion",
  dlp_end: "End of DLP",
  bank_guarantee: "Against bank guarantee",
  other: "Other",
};

/** The cost components of an escalation clause (CM-0023 §9). */
export const ESCALATION_COMPONENTS = [
  "labour",
  "material",
  "cement",
  "steel",
  "bitumen",
  "pol",
  "other",
] as const;
export type EscalationComponent = (typeof ESCALATION_COMPONENTS)[number];
export const ESCALATION_COMPONENT_LABELS: Record<EscalationComponent, string> =
  {
    labour: "Labour",
    material: "Material",
    cement: "Cement",
    steel: "Steel",
    bitumen: "Bitumen",
    pol: "POL (fuel and lubricants)",
    other: "Other",
  };

/**
 * The TDS nature of a payment (CM-0023 §14). **Provisional:** finance's
 * natures and their dated section table arrive in CM-1116, which should
 * take these keys over (or map them) rather than invent new ones. A Work
 * Order stores the key as text (`work_orders.tds_nature`); null means no
 * TDS. A Contractor with TDS applicable defaults to `contractor`.
 */
export const TDS_NATURES = [
  "contractor",
  "professional",
  "technical",
  "rent_plant",
  "rent_land",
  "goods_purchase",
] as const;
export type TdsNature = (typeof TDS_NATURES)[number];
export const TDS_NATURE_LABELS: Record<TdsNature, string> = {
  contractor: "Contractor / labour supply",
  professional: "Professional fee",
  technical: "Technical fee",
  rent_plant: "Rent of plant and machinery",
  rent_land: "Rent of land or building",
  goods_purchase: "Purchase of goods",
};

/**
 * The SAC codes a Work Order usually carries (CM-0023 §5): works contract,
 * or labour supply. Any other 4–8 digit code may be typed.
 */
export const WORK_ORDER_SAC_PRESETS = [
  { code: "9954", label: "9954 · Works contract" },
  { code: "9985", label: "9985 · Labour supply (support services)" },
  { code: "9987", label: "9987 · Repair and maintenance services" },
] as const;

/** GST % a Work Order may carry: 0 to 28 with two places; these are offered. */
export const WORK_ORDER_GST_RATES = ["0", "5", "12", "18", "28"] as const;
