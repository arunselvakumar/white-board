"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  Controller,
  useFieldArray,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { FieldError } from "@/components/auth/field-error";
import { parseRupeesInput } from "@/lib/money";
import type { PreschoolStockOnHand } from "@/src/queries/preschool/stock";

export type StockRow = PreschoolStockOnHand["items"][number];

export const stockLineSchema = z.object({
  itemId: z.string().min(1, "Choose an item"),
  quantity: z
    .string()
    .trim()
    .regex(/^[1-9]\d{0,5}$/, "Enter a whole number above 0"),
  unitCostRupees: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || parseRupeesInput(value) != null,
      "Enter rupees, up to 2 decimal places",
    ),
});

export type StockLineValues = z.infer<typeof stockLineSchema>;

/** Rows must name different items. */
export function checkDistinctItems(
  lines: readonly StockLineValues[],
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  lines.forEach((line, index) => {
    if (line.itemId === "") return;
    if (seen.has(line.itemId))
      ctx.addIssue({
        code: "custom",
        path: ["lines", index, "itemId"],
        message: "This item is already listed",
      });
    seen.add(line.itemId);
  });
}

export function emptyLine(itemId = ""): StockLineValues {
  return { itemId, quantity: "", unitCostRupees: "" };
}

type LinesForm = { lines: StockLineValues[] };

/**
 * Rows of item and quantity, each showing stock on hand at the Centre; with
 * `withCost`, a unit cost too (receiving).
 */
export function StockLinesField<Form extends LinesForm>({
  control,
  register,
  errors,
  stock,
  withCost = false,
}: {
  control: Control<Form>;
  register: UseFormRegister<Form>;
  errors: FieldErrors<Form>;
  stock: readonly StockRow[];
  withCost?: boolean;
}) {
  const linesControl = control as unknown as Control<LinesForm>;
  const linesRegister = register as unknown as UseFormRegister<LinesForm>;
  const lineErrors = (errors as FieldErrors<LinesForm>).lines;
  const { fields, append, remove } = useFieldArray({
    control: linesControl,
    name: "lines",
  });
  const lines = useWatch({ control: linesControl, name: "lines" });
  const items = stock.map((row) => ({ value: row.itemId, label: row.name }));
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-2 text-sm font-medium">Items</legend>
      {fields.map((field, index) => {
        const row = stock.find(
          (candidate) => candidate.itemId === lines[index]?.itemId,
        );
        const errorsHere = lineErrors?.[index];
        return (
          <div
            key={field.id}
            className="grid grid-cols-[1fr_auto] items-start gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_7rem_auto] sm:border-0 sm:p-0"
          >
            <div className="col-span-2 space-y-1 sm:col-span-1">
              <Controller
                name={`lines.${index}.itemId`}
                control={linesControl}
                render={({ field: itemField }) => (
                  <Select
                    items={items}
                    value={itemField.value === "" ? null : itemField.value}
                    onValueChange={(value) => {
                      if (value != null) itemField.onChange(value);
                    }}
                  >
                    <SelectTrigger
                      size="lg"
                      aria-label={`Item ${index + 1}`}
                      className="w-full min-w-0"
                    >
                      <SelectValue placeholder="Choose an item" />
                    </SelectTrigger>
                    <SelectContent>
                      {stock.map((option) => (
                        <SelectItem
                          key={option.itemId}
                          value={option.itemId}
                          tag={`${option.onHand} ${option.unit}`}
                        >
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-muted-foreground text-xs">
                {row == null ? " " : `${row.onHand} ${row.unit} on hand`}
              </p>
              <FieldError message={errorsHere?.itemId?.message} />
            </div>
            <div className="space-y-1">
              <Input
                aria-label={`Quantity ${index + 1}`}
                inputMode="numeric"
                placeholder="Qty"
                className="h-10"
                aria-invalid={errorsHere?.quantity != null}
                {...linesRegister(`lines.${index}.quantity`)}
              />
              <FieldError message={errorsHere?.quantity?.message} />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove item ${index + 1}`}
              disabled={fields.length === 1}
              onClick={() => {
                remove(index);
              }}
            >
              <Trash2 aria-hidden="true" />
            </Button>
            {withCost ? (
              <div className="col-span-2 space-y-1 sm:col-span-3 sm:max-w-48">
                <Input
                  aria-label={`Unit cost ${index + 1} (₹)`}
                  inputMode="decimal"
                  placeholder="Unit cost (₹)"
                  className="h-10"
                  aria-invalid={errorsHere?.unitCostRupees != null}
                  {...linesRegister(`lines.${index}.unitCostRupees`)}
                />
                <FieldError message={errorsHere?.unitCostRupees?.message} />
              </div>
            ) : null}
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={fields.length >= 50}
        onClick={() => {
          append(emptyLine());
        }}
      >
        <Plus aria-hidden="true" />
        Add item
      </Button>
    </fieldset>
  );
}
