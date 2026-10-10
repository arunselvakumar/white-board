"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { Suspense, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Skeleton } from "@repo/ui/components/skeleton";

import { FieldError } from "@/components/auth/field-error";
import { LocationPicker } from "@/components/locations/location-picker";
import { MaterialPicker } from "@/components/procurement/material-picker";
import type { StockLocation } from "@/src/procurement/domain/stock-location";
import { useRecordMovements } from "@/src/queries/inventory";
import type { LocationRef } from "@/src/shared-kernel/location-ref";

import {
  formatQuantity,
  localToday,
  QUANTITY_PATTERN,
} from "./inventory-format";
import { StockErrorAlert } from "./stock-error-alert";

export type MovementKind = "consumed" | "missing";

const COPY: Record<
  MovementKind,
  { title: string; description: string; date: string; submit: string }
> = {
  consumed: {
    title: "Consume Material",
    description:
      "Record what was used, one line per material. Stock goes down on each date.",
    date: "Consume Date",
    submit: "Save consumption",
  },
  missing: {
    title: "Missing Materials",
    description:
      "Record material lost, stolen or damaged, one line per material.",
    date: "Missing Date",
    submit: "Save missing",
  },
};

const line = z.object({
  date: z.string().min(1, "Choose the date."),
  materialId: z.string().min(1, "Choose a material."),
  quantity: z
    .string()
    .trim()
    .regex(QUANTITY_PATTERN, "Enter a quantity with at most 3 decimals.")
    .refine((value) => Number(value) > 0, "Enter a quantity more than 0."),
  siteLocation: z.custom<LocationRef | null>(),
  remark: z.string().max(500, "Use at most 500 characters."),
});

const schema = z.object({ lines: z.array(line).min(1).max(100) });
type Values = z.infer<typeof schema>;

function blankLine(materialId = ""): Values["lines"][number] {
  return {
    date: localToday(),
    materialId,
    quantity: "",
    siteLocation: null,
    remark: "",
  };
}

/** Stock per material, for the "In stock" hint beside each line. */
export type StockHints = ReadonlyMap<
  string,
  { inStock: string; uomName: string }
>;

function MovementForm({
  location,
  kind,
  materialIds,
  stock,
  onClose,
}: {
  location: StockLocation;
  kind: MovementKind;
  materialIds: readonly string[];
  stock: StockHints;
  onClose: () => void;
}) {
  const copy = COPY[kind];
  const record = useRecordMovements();
  const [error, setError] = useState<unknown>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      lines:
        materialIds.length > 0
          ? materialIds.map((id) => blankLine(id))
          : [blankLine()],
    },
  });
  const lines = useFieldArray({ control: form.control, name: "lines" });
  const values = useWatch({ control: form.control, name: "lines" });
  const withSite = kind === "consumed" && location.kind === "project";

  const submit = async (input: Values) => {
    setError(null);
    try {
      await record.mutateAsync({
        location,
        kind,
        lines: input.lines.map((item) => ({
          date: item.date,
          materialId: item.materialId,
          quantity: item.quantity.trim(),
          siteLocation: withSite ? item.siteLocation : null,
          remark: item.remark.trim() === "" ? null : item.remark.trim(),
        })),
      });
      onClose();
    } catch (caught) {
      setError(caught);
    }
  };

  return (
    <form
      noValidate
      className="flex min-h-0 flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit(submit)(event);
      }}
    >
      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
      </DialogHeader>
      <ol className="-mx-1 max-h-[60vh] space-y-3 overflow-y-auto px-1">
        {lines.fields.map((field, index) => {
          const errors = form.formState.errors.lines?.[index];
          const materialId = values[index]?.materialId ?? "";
          const hint = stock.get(materialId);
          const id = (name: string) => `movement-${String(index)}-${name}`;
          return (
            <li
              key={field.id}
              aria-label={`Line ${String(index + 1)}`}
              className="space-y-3 rounded-lg border p-3"
            >
              <div className="grid gap-3 sm:grid-cols-[1fr_10rem_9rem]">
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={id("material")}>Material</Label>
                  <Controller
                    control={form.control}
                    name={`lines.${index}.materialId`}
                    render={({ field: control }) => (
                      <MaterialPicker
                        id={id("material")}
                        value={control.value === "" ? null : control.value}
                        excludeIds={values
                          .map((item) => item.materialId)
                          .filter((value, at) => at !== index && value !== "")}
                        invalid={errors?.materialId != null}
                        onChange={(material) => {
                          control.onChange(material?.id ?? "");
                        }}
                      />
                    )}
                  />
                  <FieldError message={errors?.materialId?.message} />
                  {hint != null && (
                    <p className="text-muted-foreground text-xs">
                      In stock: {formatQuantity(hint.inStock)} {hint.uomName}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={id("date")}>{copy.date}</Label>
                  <Input
                    id={id("date")}
                    type="date"
                    max={localToday()}
                    aria-invalid={errors?.date != null}
                    {...form.register(`lines.${index}.date`)}
                  />
                  <FieldError message={errors?.date?.message} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={id("quantity")}>Quantity</Label>
                  <Input
                    id={id("quantity")}
                    inputMode="decimal"
                    autoComplete="off"
                    aria-invalid={errors?.quantity != null}
                    {...form.register(`lines.${index}.quantity`)}
                  />
                  <FieldError message={errors?.quantity?.message} />
                </div>
              </div>
              {withSite && (
                <Suspense fallback={<Skeleton className="h-8 w-full" />}>
                  <Controller
                    control={form.control}
                    name={`lines.${index}.siteLocation`}
                    render={({ field: control }) => (
                      <LocationPicker
                        projectId={location.id}
                        label="Location"
                        value={control.value}
                        onChange={control.onChange}
                      />
                    )}
                  />
                </Suspense>
              )}
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label htmlFor={id("remark")}>Remarks</Label>
                  <Input
                    id={id("remark")}
                    autoComplete="off"
                    aria-invalid={errors?.remark != null}
                    {...form.register(`lines.${index}.remark`)}
                  />
                  <FieldError message={errors?.remark?.message} />
                </div>
                {lines.fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove line ${String(index + 1)}`}
                    onClick={() => {
                      lines.remove(index);
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {lines.fields.length < 100 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => {
            lines.append(blankLine());
          }}
        >
          <Plus aria-hidden="true" />
          Add line
        </Button>
      )}
      <StockErrorAlert error={error} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving…" : copy.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Consume Material or Missing Materials (CM-506): one or many lines, each
 * with its date (back-dated limits apply), quantity, remark and — for
 * consumption at a Project — where on site. A refusal for stock names
 * each material, how much is short and from which date.
 */
export function StockMovementDialog({
  location,
  kind,
  materialIds = [],
  stock = new Map(),
  onClose,
}: {
  location: StockLocation;
  /** Null keeps it closed. */
  kind: MovementKind | null;
  /** Lines to start with (materials chosen on the list). */
  materialIds?: readonly string[];
  stock?: StockHints;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={kind != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-3xl">
        {kind == null ? null : (
          <MovementForm
            key={`${kind}-${materialIds.join(",")}`}
            location={location}
            kind={kind}
            materialIds={materialIds}
            stock={stock}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
