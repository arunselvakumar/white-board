"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { Switch } from "@repo/ui/components/switch";

import { FieldError } from "@/components/auth/field-error";
import type { StockLocation } from "@/src/procurement/domain/stock-location";
import {
  useUpdateStockSettings,
  type InventoryRow,
} from "@/src/queries/inventory";

import { formatQuantity, QUANTITY_PATTERN } from "./inventory-format";
import { StockErrorAlert } from "./stock-error-alert";

export type SettingsMode = "estimate" | "minimum";

const optionalQuantity = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || QUANTITY_PATTERN.test(value),
    "Enter 0 or more, with at most 3 decimals.",
  );

const schema = z.object({
  estimatedQty: optionalQuantity,
  minStockQty: optionalQuantity,
  minAlertEnabled: z.boolean(),
});
type Values = z.infer<typeof schema>;

const trimZeros = (value: string | null) =>
  value == null ? "" : String(Number(value));

function SettingsForm({
  location,
  row,
  mode,
  onClose,
}: {
  location: StockLocation;
  row: InventoryRow;
  mode: SettingsMode;
  onClose: () => void;
}) {
  const update = useUpdateStockSettings();
  const [error, setError] = useState<unknown>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      estimatedQty: trimZeros(row.estimatedQty),
      minStockQty: trimZeros(row.minimumOverride),
      minAlertEnabled: row.alertEnabled,
    },
  });
  const errors = form.formState.errors;

  const submit = async (values: Values) => {
    setError(null);
    const blank = (value: string) => (value === "" ? null : value);
    try {
      await update.mutateAsync(
        mode === "estimate"
          ? {
              location,
              materialId: row.materialId,
              estimatedQty: blank(values.estimatedQty),
            }
          : {
              location,
              materialId: row.materialId,
              minStockQty: blank(values.minStockQty),
              minAlertEnabled: values.minAlertEnabled,
            },
      );
      onClose();
    } catch (caught) {
      setError(caught);
    }
  };

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit(submit)(event);
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {mode === "estimate" ? "Estimation Qty" : "Minimum stock"}
        </DialogTitle>
        <DialogDescription>
          {mode === "estimate"
            ? `How much ${row.materialName} this location needs in all. Purchase Requests show what is still to come.`
            : `Below this, ${row.materialName} shows as Low stock here.`}
        </DialogDescription>
      </DialogHeader>
      {mode === "estimate" ? (
        <div className="space-y-1.5">
          <Label htmlFor="settings-estimate">
            Estimated Qty ({row.uomName})
          </Label>
          <Input
            id="settings-estimate"
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={errors.estimatedQty != null}
            {...form.register("estimatedQty")}
          />
          <FieldError message={errors.estimatedQty?.message} />
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="settings-minimum">
              Minimum stock here ({row.uomName})
            </Label>
            <Input
              id="settings-minimum"
              inputMode="decimal"
              autoComplete="off"
              placeholder={
                row.materialMinimum == null
                  ? "None"
                  : formatQuantity(row.materialMinimum)
              }
              aria-invalid={errors.minStockQty != null}
              {...form.register("minStockQty")}
            />
            <FieldError message={errors.minStockQty?.message} />
            <p className="text-muted-foreground text-xs">
              {row.materialMinimum == null
                ? "Leave empty for no minimum."
                : `Leave empty to use the Material's minimum, ${formatQuantity(row.materialMinimum)} ${row.uomName}.`}
            </p>
          </div>
          <Controller
            control={form.control}
            name="minAlertEnabled"
            render={({ field }) => (
              <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="settings-alert">Minimum stock alert</Label>
                  <p className="text-muted-foreground text-xs">
                    Notify when stock falls to the minimum.
                  </p>
                </div>
                <Switch
                  id="settings-alert"
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    field.onChange(checked);
                  }}
                />
              </div>
            )}
          />
        </>
      )}
      <StockErrorAlert error={error} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Update / Add Estimation Qty, or the minimum stock here with the
 * Start / Stop minimum stock alert toggle (CM-506).
 */
export function StockSettingsDialog({
  location,
  target,
  onClose,
}: {
  location: StockLocation;
  /** Null keeps it closed. */
  target: { row: InventoryRow; mode: SettingsMode } | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={target != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        {target == null ? null : (
          <SettingsForm
            key={`${target.row.materialId}-${target.mode}`}
            location={location}
            row={target.row}
            mode={target.mode}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
