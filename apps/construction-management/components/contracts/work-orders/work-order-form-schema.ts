import { z } from "zod";

import { isRupees, rupeesToPaise } from "@/components/money/money-input";
import {
  boqAmount,
  boqQuantity,
  quantityText,
} from "@/src/contracts/domain/boq";
import { isValidSacHsn } from "@/src/contracts/domain/item";
import type { TdsNature } from "@/src/contracts/domain/contract-terms";
import type {
  WorkOrder,
  WorkOrderBoqItem,
  WorkOrderInput,
} from "@/src/queries/contracts-work-orders";

import { percentInput, quantityInput } from "./work-order-format";

/**
 * The Work Order form's values (CM-1104). Rupees and percentages are text
 * as typed; a line's `key` stays with it while lines are added and
 * removed, so a material's coefficients follow their line.
 */

const percentOk = (value: string, max = 100) => {
  if (value.trim() === "") return true;
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return false;
  return Number(value) <= max;
};

const line = z.object({
  key: z.string(),
  id: z.string().nullable(),
  kind: z.enum(["boq", "non_boq"]),
  boqItemId: z.string().nullable(),
  libraryItemId: z.string().nullable(),
  itemNo: z.string().trim().max(32, "Use at most 32 characters"),
  description: z.string().trim().min(1, "Enter the description"),
  uomId: z.string().min(1, "Pick the UoM"),
  sacHsn: z
    .string()
    .trim()
    .refine((value) => value === "" || isValidSacHsn(value), "4 to 8 digits"),
  quantity: z
    .string()
    .trim()
    .refine(
      (value) => boqQuantity(value) != null,
      "More than 0, four decimals",
    ),
  rate: z.string().trim(),
});

const material = z.object({
  materialId: z.string().min(1, "Pick the Material"),
  materialName: z.string(),
  uomName: z.string(),
  issueBasis: z.enum(["free", "at_cost"]),
  issueRate: z.string().trim(),
  wastagePercent: z
    .string()
    .trim()
    .refine((value) => percentOk(value), "0 to 100"),
  penalRate: z.string().trim(),
  coefficients: z.record(z.string(), z.string()),
});

export function workOrderSchema(financial: boolean) {
  return z
    .object({
      contractorId: z.string().min(1, "Pick the Contractor"),
      departmentId: z.string(),
      orderDate: z.string().min(1, "Pick the order date"),
      validUntil: z.string(),
      scope: z.string().max(4000, "Use at most 4,000 characters"),
      retentionPercent: z
        .string()
        .refine((value) => percentOk(value), "0 to 100, two decimals"),
      retentionCapPercent: z
        .string()
        .refine((value) => percentOk(value), "0 to 100, two decimals"),
      retentionCompletionPercent: z
        .string()
        .refine((value) => percentOk(value), "0 to 100, two decimals"),
      dlpMonths: z
        .string()
        .refine(
          (value) =>
            value.trim() === "" ||
            (/^\d+$/.test(value.trim()) && Number(value) <= 120),
          "0 to 120 months",
        ),
      tdsNature: z.string(),
      sacCode: z
        .string()
        .trim()
        .refine(
          (value) => value === "" || isValidSacHsn(value),
          "4 to 8 digits",
        ),
      gstRate: z
        .string()
        .refine((value) => percentOk(value, 28), "0 to 28, two decimals"),
      reverseCharge: z.boolean(),
      mobilisationAdvance: z.string(),
      mobilisationRecoveryPercent: z
        .string()
        .refine((value) => percentOk(value), "0 to 100, two decimals"),
      lines: z.array(line).min(1, "Add at least one line"),
      materials: z.array(material),
    })
    .superRefine((values, context) => {
      const issue = (path: (string | number)[], message: string) => {
        context.addIssue({ code: "custom", path, message });
      };
      if (values.validUntil !== "" && values.validUntil < values.orderDate)
        issue(["validUntil"], "On or after the order date");
      if (!financial) return;
      values.lines.forEach((row, index) => {
        if (!isRupees(row.rate))
          issue(["lines", index, "rate"], "Enter the rate");
      });
      if (
        values.mobilisationAdvance.trim() !== "" &&
        !isRupees(values.mobilisationAdvance)
      )
        issue(["mobilisationAdvance"], "Enter an amount");
      values.materials.forEach((row, index) => {
        if (row.issueBasis === "at_cost" && !isRupees(row.issueRate))
          issue(["materials", index, "issueRate"], "Enter the issue rate");
        if (row.penalRate.trim() !== "" && !isRupees(row.penalRate))
          issue(["materials", index, "penalRate"], "Enter an amount");
      });
      const seen = new Set<string>();
      values.materials.forEach((row, index) => {
        if (row.materialId !== "" && seen.has(row.materialId))
          issue(["materials", index, "materialId"], "Already on the list");
        seen.add(row.materialId);
      });
    });
}

export type WorkOrderValues = z.infer<ReturnType<typeof workOrderSchema>>;
export type LineValues = WorkOrderValues["lines"][number];
export type MaterialValues = WorkOrderValues["materials"][number];

let counter = 0;

/** A key for a new line, unique on the page. */
export function lineKey(): string {
  counter += 1;
  return `line-${String(counter)}`;
}

const rupees = (paise: number | null | undefined): string =>
  paise == null ? "" : (paise / 100).toFixed(2).replace(/\.00$/, "");

/** The values a new Work Order starts with. */
export function newWorkOrderValues(today: string): WorkOrderValues {
  return {
    contractorId: "",
    departmentId: "",
    orderDate: today,
    validUntil: "",
    scope: "",
    retentionPercent: "",
    retentionCapPercent: "",
    retentionCompletionPercent: "50",
    dlpMonths: "",
    tdsNature: "",
    sacCode: "9954",
    gstRate: "18",
    reverseCharge: false,
    mobilisationAdvance: "",
    mobilisationRecoveryPercent: "",
    lines: [],
    materials: [],
  };
}

/** A Work Order as loaded, as form values. */
export function workOrderValues(
  workOrder: WorkOrder,
  boqItems: readonly WorkOrderBoqItem[],
): WorkOrderValues {
  const library = new Map(
    boqItems.map((item) => [item.id, item.libraryItemId]),
  );
  const keys = new Map(workOrder.lines.map((row) => [row.id, lineKey()]));
  const { terms } = workOrder;
  return {
    contractorId: workOrder.contractorId,
    departmentId: workOrder.departmentId ?? "",
    orderDate: workOrder.orderDate,
    validUntil: workOrder.validUntil ?? "",
    scope: workOrder.scope ?? "",
    retentionPercent: percentInput(terms.retentionPercent),
    retentionCapPercent: percentInput(terms.retentionCapPercent),
    retentionCompletionPercent: percentInput(terms.retentionCompletionPercent),
    dlpMonths: terms.dlpMonths == null ? "" : String(terms.dlpMonths),
    tdsNature: terms.tdsNature ?? "",
    sacCode: terms.sacCode ?? "",
    gstRate: percentInput(terms.gstRate),
    reverseCharge: terms.reverseCharge,
    mobilisationAdvance: rupees(terms.mobilisationAdvance),
    mobilisationRecoveryPercent: percentInput(
      terms.mobilisationRecoveryPercent,
    ),
    lines: workOrder.lines.map((row) => ({
      key: keys.get(row.id) ?? lineKey(),
      id: row.id,
      kind: row.kind,
      boqItemId: row.boqItemId,
      libraryItemId:
        row.boqItemId == null ? null : (library.get(row.boqItemId) ?? null),
      itemNo: row.itemNo ?? "",
      description: row.description,
      uomId: row.uomId,
      sacHsn: row.sacHsn ?? "",
      quantity: quantityInput(row.quantity),
      rate: rupees(row.rate),
    })),
    materials: workOrder.materials.map((row) => ({
      materialId: row.materialId,
      materialName: row.materialName,
      uomName: row.uomName,
      issueBasis: row.issueBasis,
      issueRate: rupees(row.issueRate),
      wastagePercent: percentInput(row.wastagePercent),
      penalRate: rupees(row.penalRate),
      coefficients: Object.fromEntries(
        row.coefficients.map((entry) => [
          keys.get(entry.lineId) ?? entry.lineId,
          quantityInput(entry.coefficient),
        ]),
      ),
    })),
  };
}

/** A BOQ item as a new line: what is left (when anything is) at its rate. */
export function lineFromBoq(item: WorkOrderBoqItem): LineValues {
  const left = boqQuantity(item.remaining);
  return {
    key: lineKey(),
    id: null,
    kind: "boq",
    boqItemId: item.id,
    libraryItemId: item.libraryItemId,
    itemNo: item.itemNo,
    description: item.description,
    uomId: item.uomId,
    sacHsn: item.sacHsn ?? "",
    quantity: left == null ? "" : quantityInput(item.remaining),
    rate: rupees(item.rate),
  };
}

export function blankLine(): LineValues {
  return {
    key: lineKey(),
    id: null,
    kind: "non_boq",
    boqItemId: null,
    libraryItemId: null,
    itemNo: "",
    description: "",
    uomId: "",
    sacHsn: "",
    quantity: "",
    rate: "",
  };
}

/** Paise of one line while typing, or null until quantity and rate are numbers. */
export function lineAmount(row: {
  quantity: string;
  rate: string;
}): bigint | null {
  const quantity = boqQuantity(row.quantity);
  const rate = isRupees(row.rate) ? rupeesToPaise(row.rate) : null;
  if (quantity == null || rate == null) return null;
  return boqAmount(quantity, BigInt(rate));
}

/** The running total: the sum of the lines' rounded amounts. */
export function runningTotal(
  rows: readonly { quantity: string; rate: string }[],
) {
  return rows.reduce((sum, row) => sum + (lineAmount(row) ?? 0n), 0n);
}

export type FormWarning = { boqItemId: string; itemNo: string; text: string };

/** BOQ items this form orders more of than the BOQ has left (warnings, never errors). */
export function formWarnings(
  rows: readonly LineValues[],
  boqItems: readonly WorkOrderBoqItem[],
): FormWarning[] {
  const ordered = new Map<string, bigint>();
  for (const row of rows) {
    if (row.kind !== "boq" || row.boqItemId == null) continue;
    const quantity = boqQuantity(row.quantity) ?? 0n;
    ordered.set(row.boqItemId, (ordered.get(row.boqItemId) ?? 0n) + quantity);
  }
  const warnings: FormWarning[] = [];
  for (const [boqItemId, quantity] of ordered) {
    const item = boqItems.find((candidate) => candidate.id === boqItemId);
    if (item == null) continue;
    const left = BigInt(item.remaining.replace(".", ""));
    if (quantity <= left) continue;
    const trim = (value: bigint) => quantityInput(quantityText(value));
    warnings.push({
      boqItemId,
      itemNo: item.itemNo,
      text: `BOQ item ${item.itemNo}: ordering ${trim(quantity)} ${item.uomName}, the BOQ has ${left <= 0n ? "nothing" : `${trim(left)} ${item.uomName}`} left after other Work Orders.`,
    });
  }
  return warnings;
}

/** The request body for a create, update or amendment. */
export function workOrderBody(
  values: WorkOrderValues,
  financial: boolean,
): Omit<WorkOrderInput, "projectId"> {
  const paise = (value: string) =>
    value.trim() === "" ? null : rupeesToPaise(value);
  const blankNull = (value: string) =>
    value.trim() === "" ? null : value.trim();
  return {
    contractorId: values.contractorId,
    departmentId: blankNull(values.departmentId),
    orderDate: values.orderDate,
    validUntil: blankNull(values.validUntil),
    scope: blankNull(values.scope),
    terms: {
      retentionPercent: blankNull(values.retentionPercent),
      retentionCapPercent: blankNull(values.retentionCapPercent),
      retentionCompletionPercent: blankNull(values.retentionCompletionPercent),
      dlpMonths:
        values.dlpMonths.trim() === "" ? null : Number(values.dlpMonths),
      tdsNature: blankNull(values.tdsNature) as TdsNature | null,
      sacCode: blankNull(values.sacCode),
      gstRate: blankNull(values.gstRate),
      reverseCharge: values.reverseCharge,
      ...(financial
        ? { mobilisationAdvance: paise(values.mobilisationAdvance) }
        : {}),
      mobilisationRecoveryPercent: blankNull(
        values.mobilisationRecoveryPercent,
      ),
    },
    lines: values.lines.map((row) => ({
      ...(row.id == null ? {} : { id: row.id }),
      kind: row.kind,
      boqItemId: row.boqItemId,
      itemNo: blankNull(row.itemNo),
      description: row.description.trim(),
      uomId: row.uomId,
      sacHsn: blankNull(row.sacHsn),
      quantity: row.quantity.trim(),
      ...(financial ? { rate: rupeesToPaise(row.rate) } : {}),
    })),
    materials: values.materials.map((row) => ({
      materialId: row.materialId,
      issueBasis: row.issueBasis,
      issueRate:
        financial && row.issueBasis === "at_cost" ? paise(row.issueRate) : null,
      wastagePercent: blankNull(row.wastagePercent),
      penalRate: financial ? paise(row.penalRate) : null,
      coefficients: values.lines.map((entry, index) => ({
        line: index,
        coefficient: blankNull(row.coefficients[entry.key] ?? ""),
      })),
    })),
  };
}
