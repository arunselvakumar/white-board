import { z } from "zod";

import type { Side } from "@/src/contracts/domain/contract-terms";
import {
  measuredItems,
  measurementNumber,
  previewQuantity,
  rowsOver,
  type MeasuredItem,
} from "@/src/contracts/domain/measurement";
import type {
  MeasurementInput,
  MeasurementSheet,
} from "@/src/queries/contracts-measurements";
import type { LocationRef } from "@/src/shared-kernel/location-ref";

import { quantityInput } from "./measurement-format";

/** One row as the form holds it: numbers as typed. */
export type MeasurementRowValues = {
  /** A stable key for React and for messages. */
  key: string;
  /** The BOQ item (client side) or Work Order line (contractor side). */
  itemId: string;
  description: string;
  location: LocationRef | null;
  nos: string;
  length: string;
  breadth: string;
  depth: string;
  direct: boolean;
  quantity: string;
};

export type MeasurementValues = {
  workOrderId: string;
  measuredOn: string;
  title: string;
  remarks: string;
  rows: MeasurementRowValues[];
};

let counter = 0;
export function rowKey(): string {
  counter += 1;
  return `row-${String(counter)}`;
}

export function blankRow(itemId = ""): MeasurementRowValues {
  return {
    key: rowKey(),
    itemId,
    description: "",
    location: null,
    nos: "",
    length: "",
    breadth: "",
    depth: "",
    direct: false,
    quantity: "",
  };
}

/** A copy of a row (new key), for "Duplicate". */
export function duplicateRow(row: MeasurementRowValues): MeasurementRowValues {
  return { ...row, key: rowKey() };
}

export function newMeasurementValues(today: string): MeasurementValues {
  return {
    workOrderId: "",
    measuredOn: today,
    title: "",
    remarks: "",
    rows: [blankRow()],
  };
}

export function measurementValues(sheet: MeasurementSheet): MeasurementValues {
  return {
    workOrderId: sheet.workOrderId ?? "",
    measuredOn: sheet.measuredOn,
    title: sheet.title ?? "",
    remarks: sheet.remarks ?? "",
    rows: sheet.rows.map((row) => ({
      key: rowKey(),
      itemId: row.boqItemId ?? row.workOrderLineId ?? "",
      description: row.description ?? "",
      location: row.location,
      nos: quantityInput(row.nos),
      length: quantityInput(row.length),
      breadth: quantityInput(row.breadth),
      depth: quantityInput(row.depth),
      direct: row.direct,
      quantity: row.direct ? quantityInput(row.quantity) : "",
    })),
  };
}

/** The row's quantity as the form works it out (ten-thousandths), or null. */
export function rowQuantity(row: MeasurementRowValues): bigint | null {
  return previewQuantity(row);
}

function readable(raw: string): boolean {
  return raw.trim() === "" || measurementNumber(raw) != null;
}

/** What the browser checks before saving; the server checks again. */
export function measurementSchema(side: Side) {
  return z
    .object({
      workOrderId: z.string(),
      measuredOn: z.string().min(1, "Enter the date measured."),
      title: z.string().max(120, "The title is at most 120 characters."),
      remarks: z
        .string()
        .max(2000, "The remarks are at most 2,000 characters."),
      rows: z.array(
        z.object({
          key: z.string(),
          itemId: z
            .string()
            .min(
              1,
              side === "client"
                ? "Pick the BOQ item measured."
                : "Pick the Work Order line measured.",
            ),
          description: z
            .string()
            .max(500, "The description is at most 500 characters."),
          location: z.custom<LocationRef | null>(),
          nos: z.string(),
          length: z.string(),
          breadth: z.string(),
          depth: z.string(),
          direct: z.boolean(),
          quantity: z.string(),
        }),
      ),
    })
    .superRefine((values, context) => {
      if (side === "contractor" && values.workOrderId === "")
        context.addIssue({
          code: "custom",
          path: ["workOrderId"],
          message: "Pick the issued Work Order measured.",
        });
      values.rows.forEach((row, index) => {
        if (row.direct) {
          const typed = measurementNumber(row.quantity);
          if (typed == null || typed === 0n)
            context.addIssue({
              code: "custom",
              path: ["rows", index, "quantity"],
              message:
                "Enter the quantity: not 0, at most four decimals (negative for a deduction).",
            });
          return;
        }
        for (const name of ["nos", "length", "breadth", "depth"] as const)
          if (!readable(row[name]))
            context.addIssue({
              code: "custom",
              path: ["rows", index, name],
              message: "A number with at most four decimals.",
            });
        if (rowQuantity(row) == null || rowQuantity(row) === 0n)
          context.addIssue({
            code: "custom",
            path: ["rows", index, "quantity"],
            message:
              "Dimensions are more than 0 and nos is not 0; use a negative nos for a deduction.",
          });
      });
    });
}

/** The API body of the form's values. */
export function measurementBody(side: Side, values: MeasurementValues) {
  const blank = (raw: string) => (raw.trim() === "" ? null : raw.trim());
  return {
    measuredOn: values.measuredOn,
    title: blank(values.title),
    remarks: blank(values.remarks),
    rows: values.rows.map((row) => ({
      boqItemId: side === "client" ? row.itemId : null,
      workOrderLineId: side === "contractor" ? row.itemId : null,
      description: blank(row.description),
      // The stored LocationRef's read-only id lists, as the request takes them.
      location: row.location as MeasurementInput["rows"][number]["location"],
      ...(row.direct
        ? { direct: true, quantity: row.quantity.trim() }
        : {
            direct: false,
            nos: blank(row.nos),
            length: blank(row.length),
            breadth: blank(row.breadth),
            depth: blank(row.depth),
          }),
    })),
  };
}

/**
 * The cumulative panel while you type: per item, what checked sheets
 * measured plus this form's rows, against the planned quantity; and the
 * rows that push an item over. Rows not yet readable count as 0.
 */
export function liveMeasured(
  rows: readonly MeasurementRowValues[],
  planned: ReadonlyMap<string, bigint>,
  checked: ReadonlyMap<string, bigint>,
  limit: bigint | null,
): { items: MeasuredItem[]; over: Set<number> } {
  const keyed = rows
    .filter((row) => row.itemId !== "")
    .map((row) => ({ itemId: row.itemId, quantity: rowQuantity(row) ?? 0n }));
  const indexes = rows.flatMap((row, index) =>
    row.itemId === "" ? [] : [index],
  );
  const over = new Set(
    [...rowsOver(keyed, planned, checked)].map((at) => indexes[at] ?? -1),
  );
  return { items: measuredItems(keyed, planned, checked, limit), over };
}
