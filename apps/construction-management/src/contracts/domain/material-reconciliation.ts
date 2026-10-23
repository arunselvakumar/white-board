import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { divideRounded } from "@/src/shared-kernel/decimal";
import { DomainError, forbidden } from "@/src/shared-kernel/domain-error";

import type { IssueBasis } from "./contract-terms";
import { fixedDecimal } from "./item-analysis";
import { rupees } from "./ra-bill";

/**
 * Material reconciliation (ADR CM-0023 §10, CM-1110): what a Contractor
 * should have used of each material the Company issues under a Work Order,
 * against what was issued.
 *
 * Per Work Order per running bill, cumulative to that bill, per material
 * in the material's UoM:
 *
 * - **theoretical** = Σ over the Work Order's lines of the billed quantity
 *   (approved, unreversed running bills up to and including the bill) ×
 *   the line's coefficient;
 * - **allowed** = theoretical × (1 + wastage %);
 * - **issued** = issues attributed to the Work Order dated on or before
 *   the bill's "measured up to", net of returns;
 * - **excess** = max(0, issued − allowed), recovered at the penal rate;
 * - **under-use** when issued < theoretical × (1 − wastage %): the work
 *   may be short of material.
 *
 * The figures are exact: bill quantities and coefficients are
 * ten-thousandths and issues thousandths, so every quantity here is kept
 * in 10⁻¹² of the UoM and only rounded when shown (three places) or
 * priced (paise, half up).
 */

/** 10⁻¹² of the material's UoM. */
export const RECONCILIATION_SCALE = 12;
const ONE = 10n ** BigInt(RECONCILIATION_SCALE);
/** Bill quantity (10⁻⁴) × coefficient (10⁻⁴) is 10⁻⁸; × this is 10⁻¹². */
const PRODUCT_TO_EXACT = 10_000n;
/** Issues are thousandths. */
const ISSUE_TO_EXACT = 1_000_000_000n;
/** Hundredths of a percent: 100 % = 10,000. */
const PERCENT_ONE = 10_000n;

export type MaterialCoefficient = {
  lineId: string;
  /** Ten-thousandths of the material UoM per unit of the line. */
  coefficient: bigint;
};

/** A material the Work Order issues, as reconciliation needs it. */
export type ReconciledMaterialTerms = {
  materialId: string;
  issueBasis: IssueBasis;
  /** Paise per material UoM, at cost. */
  issueRate: bigint | null;
  /** Hundredths of a percent. */
  wastagePercent: bigint;
  /** Paise per material UoM, charged on the excess. */
  penalRate: bigint | null;
  coefficients: readonly MaterialCoefficient[];
};

/** Σ billed quantity × coefficient, exact (10⁻¹²). */
export function theoreticalQuantity(
  coefficients: readonly MaterialCoefficient[],
  billed: ReadonlyMap<string, bigint>,
): bigint {
  return coefficients.reduce(
    (sum, row) =>
      sum + (billed.get(row.lineId) ?? 0n) * row.coefficient * PRODUCT_TO_EXACT,
    0n,
  );
}

/** Thousandths (an issue or a return) as the exact scale. */
export function issueQuantityExact(thousandths: bigint): bigint {
  return thousandths * ISSUE_TO_EXACT;
}

/** An exact quantity rounded to ten-thousandths (escalation's 10CA quantity). */
export function exactToTenThousandths(exact: bigint): bigint {
  return divideRounded(exact, 100_000_000n);
}

/** An exact quantity as shown: three places, half up (`"53.320"`). */
export function reconciliationQuantityText(exact: bigint): string {
  return fixedDecimal(divideRounded(exact, ISSUE_TO_EXACT), 3);
}

/** `round(exact quantity × paise per unit)`, half up. */
export function reconciliationValue(exact: bigint, rate: bigint): bigint {
  return divideRounded(exact * rate, ONE);
}

export type ReconciliationInput = {
  material: ReconciledMaterialTerms;
  /** Ten-thousandths billed per Work Order line, cumulative to the bill. */
  billed: ReadonlyMap<string, bigint>;
  /** Thousandths issued to the Work Order up to the bill's date. */
  issued: bigint;
  /** Thousandths returned by the Contractor up to that date. */
  returned: bigint;
  /** Paise of material reconciliation recovery on earlier approved bills. */
  recoveredBefore: bigint;
  /** Paise of material issued at cost deducted on earlier approved bills. */
  atCostDeductedBefore: bigint;
};

export type MaterialReconciliation = {
  materialId: string;
  /** Exact quantities (10⁻¹² of the UoM). */
  theoretical: bigint;
  allowed: bigint;
  /** theoretical × (1 − wastage %): below it is under-use. */
  underUseLimit: bigint;
  issued: bigint;
  returned: bigint;
  /** issued − returned. */
  netIssued: bigint;
  excess: bigint;
  underUse: boolean;
  /** Paise: cumulative excess × penal rate; null without a penal rate. */
  excessValue: bigint | null;
  recoveredBefore: bigint;
  /** Paise: max(0, excess value − recovered before). */
  recoverySuggested: bigint;
  /** Paise: net issued × issue rate, for material issued at cost. */
  atCostValue: bigint | null;
  atCostDeductedBefore: bigint;
  /** Paise: max(0, at-cost value − deducted before). */
  atCostSuggested: bigint;
};

/** One material's statement line, cumulative to a bill. */
export function reconcileMaterial(
  input: ReconciliationInput,
): MaterialReconciliation {
  const { material } = input;
  const theoretical = theoreticalQuantity(material.coefficients, input.billed);
  const allowed = divideRounded(
    theoretical * (PERCENT_ONE + material.wastagePercent),
    PERCENT_ONE,
  );
  const lower = PERCENT_ONE - material.wastagePercent;
  const underUseLimit = divideRounded(
    theoretical * (lower > 0n ? lower : 0n),
    PERCENT_ONE,
  );
  const issued = issueQuantityExact(input.issued);
  const returned = issueQuantityExact(input.returned);
  const netIssued = issued - returned;
  const excess = netIssued > allowed ? netIssued - allowed : 0n;
  const excessValue =
    material.penalRate == null
      ? null
      : reconciliationValue(excess, material.penalRate);
  const owed = (excessValue ?? 0n) - input.recoveredBefore;
  const atCostValue =
    material.issueBasis === "at_cost" && material.issueRate != null
      ? reconciliationValue(netIssued > 0n ? netIssued : 0n, material.issueRate)
      : null;
  const atCostOwed = (atCostValue ?? 0n) - input.atCostDeductedBefore;
  return {
    materialId: material.materialId,
    theoretical,
    allowed,
    underUseLimit,
    issued,
    returned,
    netIssued,
    excess,
    underUse: netIssued < underUseLimit,
    excessValue,
    recoveredBefore: input.recoveredBefore,
    recoverySuggested: owed > 0n ? owed : 0n,
    atCostValue,
    atCostDeductedBefore: input.atCostDeductedBefore,
    atCostSuggested: atCostOwed > 0n ? atCostOwed : 0n,
  };
}

/**
 * Ten-thousandths of a material consumed by billed quantities (the 10CA
 * quantity of an escalation period, CM-1110): Σ quantity × coefficient,
 * half up.
 */
export function consumedQuantity(
  coefficients: readonly MaterialCoefficient[],
  billed: ReadonlyMap<string, bigint>,
): bigint {
  return exactToTenThousandths(theoreticalQuantity(coefficients, billed));
}

// ---------------------------------------------------------------------------
// Attribution: which Work Order an issue counts towards
// ---------------------------------------------------------------------------

/** A Work Order of the Contractor on the Project an issue may count towards. */
export type AttributionCandidate = {
  id: string;
  status: string;
  orderDate: CalendarDate;
  closedOn: CalendarDate | null;
  /** Materials the Work Order issues. */
  materialIds: ReadonlySet<string>;
};

export type IssueAttribution =
  /** The Material Request names the Work Order. */
  | { how: "named"; workOrderId: string }
  /** Exactly one Work Order of the Contractor lists the material. */
  | { how: "auto"; workOrderId: string }
  /** None or several could: someone assigns it. */
  | { how: "unattributed"; workOrderId: null; candidates: string[] };

/**
 * The attribution rule (CM-1110). An issue whose Material Request names a
 * Work Order counts towards it. Otherwise it counts towards the Work Order
 * of the same Contractor on the Project that lists the material and was
 * open on the issue's date (ordered on or before it; issued, or closed on
 * or after it) when there is exactly one; with none or several it is
 * unattributed until the request is assigned one. Taking only Work Orders
 * open on the date keeps a later Work Order from taking earlier issues.
 */
export function attributeIssue(
  issue: {
    workOrderId: string | null;
    materialId: string;
    date: CalendarDate;
  },
  candidates: readonly AttributionCandidate[],
): IssueAttribution {
  if (issue.workOrderId != null)
    return { how: "named", workOrderId: issue.workOrderId };
  const open = candidates.filter(
    (candidate) =>
      candidate.materialIds.has(issue.materialId) &&
      candidate.orderDate <= issue.date &&
      (candidate.status === "issued" ||
        (candidate.status === "closed" &&
          (candidate.closedOn == null || candidate.closedOn >= issue.date))),
  );
  const [only] = open;
  if (open.length === 1 && only != null)
    return { how: "auto", workOrderId: only.id };
  return {
    how: "unattributed",
    workOrderId: null,
    candidates: open.map((candidate) => candidate.id),
  };
}

// ---------------------------------------------------------------------------
// Deductions naming a material
// ---------------------------------------------------------------------------

/** What a bill may recover for one material of its Work Order. */
export type MaterialRecoveryLimit = {
  materialId: string;
  materialName: string;
  issueBasis: IssueBasis;
  /** Paise: the suggested material reconciliation recovery. */
  recoverySuggested: bigint;
};

function deductionField(
  code: string,
  message: string,
  index: number,
  name: string,
  details: Record<string, unknown> = {},
): DomainError {
  return new DomainError(code, message, {
    details: {
      deduction: index,
      field: `deductions.${String(index)}.${name}`,
      ...details,
    },
  });
}

/**
 * Deductions naming a material (CM-1110):
 *
 * - a material reconciliation recovery names a material of the Work Order
 *   (400 `BILL_MATERIAL_REQUIRED`, `BILL_MATERIAL_INVALID`); a material
 *   issued at cost may name one, issued at cost (400
 *   `BILL_MATERIAL_INVALID`); other kinds name none;
 * - once per material and kind on a bill (400 `BILL_MATERIAL_DUPLICATE`);
 * - a recovery above its suggestion needs a reason in its description
 *   (400 `BILL_MATERIAL_RECOVERY_REASON_REQUIRED`, `details.max`) and the
 *   Contractor Bills Approve flag (403
 *   `BILL_MATERIAL_RECOVERY_OVER_SUGGESTION`). Below it is always fine.
 *
 * `checkLimit` is false for deductions kept from the stored draft, which
 * were checked when typed.
 */
export function assertMaterialDeductions(
  deductions: readonly {
    kind: string;
    amount: bigint;
    description: string | null;
    materialId: string | null;
  }[],
  limits: readonly MaterialRecoveryLimit[],
  options: {
    mayExceed: boolean;
    checkLimit: boolean;
    /** Rows kept as they were stored, checked when first typed. */
    unchanged?: (deduction: {
      kind: string;
      amount: bigint;
      description: string | null;
      materialId: string | null;
    }) => boolean;
  },
): void {
  const byId = new Map(limits.map((limit) => [limit.materialId, limit]));
  const seen = new Set<string>();
  deductions.forEach((deduction, index) => {
    const recovery = deduction.kind === "material_reconciliation";
    const atCost = deduction.kind === "material_at_cost";
    if (!recovery && !atCost) return;
    if (deduction.materialId == null) {
      if (recovery)
        throw deductionField(
          "BILL_MATERIAL_REQUIRED",
          "Name the material this recovery is for.",
          index,
          "materialId",
        );
      return;
    }
    const limit = byId.get(deduction.materialId);
    if (limit == null || (atCost && limit.issueBasis !== "at_cost"))
      throw deductionField(
        "BILL_MATERIAL_INVALID",
        atCost
          ? "Pick a material the Work Order issues at cost."
          : "Pick a material the Work Order issues.",
        index,
        "materialId",
      );
    const key = `${deduction.kind}:${deduction.materialId}`;
    if (seen.has(key))
      throw deductionField(
        "BILL_MATERIAL_DUPLICATE",
        `${limit.materialName} is already on this bill.`,
        index,
        "materialId",
      );
    seen.add(key);
    if (!recovery || !options.checkLimit) return;
    if (options.unchanged?.(deduction) === true) return;
    if (deduction.amount <= limit.recoverySuggested) return;
    const max = Number(limit.recoverySuggested);
    if ((deduction.description ?? "").trim() === "")
      throw deductionField(
        "BILL_MATERIAL_RECOVERY_REASON_REQUIRED",
        `The reconciliation suggests ₹${rupees(limit.recoverySuggested)} for ${limit.materialName}. Give a reason to recover more.`,
        index,
        "description",
        { max },
      );
    if (!options.mayExceed)
      throw forbidden(
        "BILL_MATERIAL_RECOVERY_OVER_SUGGESTION",
        `Recovering more than the suggested ₹${rupees(limit.recoverySuggested)} for ${limit.materialName} needs Approve on Contractor Bills.`,
      );
  });
}

/**
 * On a refresh or an edit that keeps the stored deductions, a recovery
 * typed without a reason that is now above its suggestion is cut to it
 * (dropped at ₹0), like retention above its cap. One with a reason (an
 * Approve holder's) stays.
 */
export function cutMaterialRecoveries<
  D extends {
    kind: string;
    amount: bigint;
    description: string | null;
    materialId: string | null;
  },
>(deductions: readonly D[], limits: readonly MaterialRecoveryLimit[]): D[] {
  const byId = new Map(limits.map((limit) => [limit.materialId, limit]));
  return deductions.flatMap((deduction) => {
    if (
      deduction.kind !== "material_reconciliation" ||
      deduction.materialId == null ||
      (deduction.description ?? "").trim() !== ""
    )
      return [deduction];
    const max = byId.get(deduction.materialId)?.recoverySuggested ?? 0n;
    if (deduction.amount <= max) return [deduction];
    return max > 0n ? [{ ...deduction, amount: max }] : [];
  });
}

/**
 * What is left of a bill for one more deduction (CM-1110): gross + GST
 * payable less every deduction on it except the line `except` names (the
 * one being suggested), never below 0. All deductions together are at
 * most gross + GST payable (`BILL_DEDUCTIONS_TOO_LARGE`), so a recovery
 * due is offered only up to this.
 */
export function roomOnBill(input: {
  gross: bigint;
  payableGst: bigint;
  deductions: readonly {
    kind: string;
    amount: bigint;
    materialId: string | null;
  }[];
  except?: { kind: string; materialId: string };
}): bigint {
  const taken = input.deductions
    .filter(
      (row) =>
        row.kind !== input.except?.kind ||
        row.materialId !== input.except.materialId,
    )
    .reduce((sum, row) => sum + row.amount, 0n);
  const room = input.gross + input.payableGst - taken;
  return room > 0n ? room : 0n;
}

/**
 * A recovery due, capped to what the bill can take: min(due, room). The
 * rest stays due and is suggested again on later bills (what earlier
 * approved bills recovered is subtracted from the cumulative due).
 */
export function fitsOnBill(due: bigint, room: bigint): bigint {
  const left = room > 0n ? room : 0n;
  return due < left ? due : left;
}

/**
 * On a refresh (or an edit that keeps the stored deductions), the bill may
 * have shrunk: material lines without a reason are trimmed, last first,
 * until all deductions fit gross + GST payable (dropped at ₹0). Lines with
 * a reason and other kinds stay, so a typed total above the bill is still
 * refused with `BILL_DEDUCTIONS_TOO_LARGE`.
 */
export function capMaterialLines<
  D extends {
    kind: string;
    amount: bigint;
    description: string | null;
    materialId: string | null;
  },
>(deductions: readonly D[], max: bigint): D[] {
  let over =
    deductions.reduce((sum, row) => sum + row.amount, 0n) -
    (max > 0n ? max : 0n);
  if (over <= 0n) return [...deductions];
  const out = [...deductions];
  for (let index = out.length - 1; index >= 0 && over > 0n; index -= 1) {
    const row = out[index];
    if (
      row?.materialId == null ||
      (row.kind !== "material_reconciliation" &&
        row.kind !== "material_at_cost") ||
      (row.description ?? "").trim() !== ""
    )
      continue;
    const cut = row.amount < over ? row.amount : over;
    over -= cut;
    out[index] = { ...row, amount: row.amount - cut };
  }
  return out.filter((row) => row.amount > 0n);
}

/** What a material deduction is matched by when a draft is refreshed: kind and material. */
export function materialDeductionKey(deduction: {
  kind: string;
  materialId: string | null;
}): string | null {
  return deduction.materialId == null
    ? null
    : `${deduction.kind}:${deduction.materialId}`;
}
