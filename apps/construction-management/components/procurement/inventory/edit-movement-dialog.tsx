"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Suspense, useState } from "react";
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
import { Skeleton } from "@repo/ui/components/skeleton";

import { FieldError } from "@/components/auth/field-error";
import { LocationPicker } from "@/components/locations/location-picker";
import type { StockLocation } from "@/src/procurement/domain/stock-location";
import { useEditMovement, type StockEntry } from "@/src/queries/inventory";
import type { LocationRef } from "@/src/shared-kernel/location-ref";

import { localToday, QUANTITY_PATTERN } from "./inventory-format";
import { StockErrorAlert } from "./stock-error-alert";

const schema = z.object({
  date: z.string().min(1, "Choose the date."),
  quantity: z
    .string()
    .trim()
    .regex(QUANTITY_PATTERN, "Enter a quantity with at most 3 decimals.")
    .refine((value) => Number(value) > 0, "Enter a quantity more than 0."),
  siteLocation: z.custom<LocationRef | null>(),
  remark: z.string().max(500, "Use at most 500 characters."),
});
type Values = z.infer<typeof schema>;

/** An entry the history can edit: a live Consumed, Missing or Opening movement. */
export type EditableEntry = StockEntry & {
  movement: NonNullable<StockEntry["movement"]>;
};

function EditForm({
  location,
  entry,
  uomName,
  onClose,
}: {
  location: StockLocation;
  entry: EditableEntry;
  uomName: string;
  onClose: () => void;
}) {
  const edit = useEditMovement();
  const [error, setError] = useState<unknown>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: entry.entryDate,
      quantity: String(Math.abs(Number(entry.quantity))),
      siteLocation: entry.siteLocation,
      remark: entry.remark ?? "",
    },
  });
  const errors = form.formState.errors;
  const withSite =
    entry.movement.kind === "consumed" && location.kind === "project";

  const submit = async (values: Values) => {
    setError(null);
    try {
      await edit.mutateAsync({
        id: entry.movement.id,
        date: values.date,
        quantity: values.quantity.trim(),
        siteLocation: withSite ? values.siteLocation : null,
        remark: values.remark.trim() === "" ? null : values.remark.trim(),
        expectedUpdatedAt: entry.movement.updatedAt,
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
        <DialogTitle>Edit {entry.typeLabel.toLowerCase()} entry</DialogTitle>
        <DialogDescription>
          The old entry is reversed and the new one posted; both stay in the
          history.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="edit-date">Date</Label>
          <Input
            id="edit-date"
            type="date"
            max={localToday()}
            aria-invalid={errors.date != null}
            {...form.register("date")}
          />
          <FieldError message={errors.date?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-quantity">Quantity ({uomName})</Label>
          <Input
            id="edit-quantity"
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={errors.quantity != null}
            {...form.register("quantity")}
          />
          <FieldError message={errors.quantity?.message} />
        </div>
      </div>
      {withSite && (
        <Suspense fallback={<Skeleton className="h-8 w-full" />}>
          <Controller
            control={form.control}
            name="siteLocation"
            render={({ field }) => (
              <LocationPicker
                projectId={location.id}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </Suspense>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="edit-remark">Remarks</Label>
        <Input
          id="edit-remark"
          autoComplete="off"
          aria-invalid={errors.remark != null}
          {...form.register("remark")}
        />
        <FieldError message={errors.remark?.message} />
      </div>
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

/** Edit a Consumed, Missing or Opening entry from the history (CM-506). */
export function EditMovementDialog({
  location,
  entry,
  uomName,
  onClose,
}: {
  location: StockLocation;
  entry: EditableEntry | null;
  uomName: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={entry != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {entry == null ? null : (
          <EditForm
            key={entry.id}
            location={location}
            entry={entry}
            uomName={uomName}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
