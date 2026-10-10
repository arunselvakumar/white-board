"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import type { StockLocation } from "@/src/procurement/domain/stock-location";
import { useAdjustStock, type InventoryRow } from "@/src/queries/inventory";

import {
  formatQuantity,
  formatSigned,
  localToday,
  QUANTITY_PATTERN,
} from "./inventory-format";
import { StockErrorAlert } from "./stock-error-alert";

const schema = z.object({
  date: z.string().min(1, "Choose the date."),
  countedQty: z
    .string()
    .trim()
    .regex(QUANTITY_PATTERN, "Enter the counted quantity (0 or more)."),
  reason: z
    .string()
    .trim()
    .min(1, "Say why the stock is adjusted.")
    .max(500, "Use at most 500 characters."),
});
type Values = z.infer<typeof schema>;

function AdjustForm({
  location,
  row,
  onClose,
}: {
  location: StockLocation;
  row: InventoryRow;
  onClose: () => void;
}) {
  const adjust = useAdjustStock();
  const [error, setError] = useState<unknown>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { date: localToday(), countedQty: "", reason: "" },
  });
  const errors = form.formState.errors;
  const counted = form.watch("countedQty");
  const today = form.watch("date") === localToday();
  const difference =
    today && QUANTITY_PATTERN.test(counted.trim())
      ? String(Number(counted) - Number(row.inStock))
      : null;

  const submit = async (values: Values) => {
    setError(null);
    try {
      await adjust.mutateAsync({
        location,
        materialId: row.materialId,
        date: values.date,
        countedQty: values.countedQty.trim(),
        reason: values.reason.trim(),
      });
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
        <DialogTitle>Adjust stock</DialogTitle>
        <DialogDescription>
          {row.materialName}: {formatQuantity(row.inStock)} {row.uomName} in
          stock. Enter what you counted; the difference is posted as an
          Adjustment.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="adjust-date">Count date</Label>
          <Input
            id="adjust-date"
            type="date"
            max={localToday()}
            aria-invalid={errors.date != null}
            {...form.register("date")}
          />
          <FieldError message={errors.date?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="adjust-counted">Counted quantity ({row.uomName})</Label>
          <Input
            id="adjust-counted"
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={errors.countedQty != null}
            {...form.register("countedQty")}
          />
          <FieldError message={errors.countedQty?.message} />
          {difference != null && Number(difference) !== 0 && (
            <p className="text-muted-foreground text-xs" role="status">
              Adjustment: {formatSigned(difference)} {row.uomName}
            </p>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="adjust-reason">Reason</Label>
        <Textarea
          id="adjust-reason"
          rows={2}
          aria-invalid={errors.reason != null}
          {...form.register("reason")}
        />
        <FieldError message={errors.reason?.message} />
      </div>
      <StockErrorAlert error={error} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving…" : "Adjust stock"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Adjust stock (CM-506): a counted quantity on a date and a reason. */
export function AdjustStockDialog({
  location,
  row,
  onClose,
}: {
  location: StockLocation;
  /** Null keeps it closed. */
  row: InventoryRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={row != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {row == null ? null : (
          <AdjustForm
            key={row.materialId}
            location={location}
            row={row}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
