"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm, type FieldPath } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { QueryHttpError } from "@/src/queries/http";
import { useUnitCommand, type SalesUnit } from "@/src/queries/sales-units";
import {
  AREA_UNIT_LABELS,
  AREA_UNITS,
  SALES_LIMITS,
  UNAVAILABLE_REASON_LABELS,
  UNAVAILABLE_REASONS,
  type UnavailableReason,
} from "@/src/sales/domain/sales-terms";
import {
  AREA_FIELD_LABELS,
  UNIT_NOTE_MAX,
} from "@/src/sales/domain/unit-profile";

const AREA = /^\d{1,10}(\.\d{1,2})?$/;

const area = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === "" ||
      (AREA.test(value.replace(/,/g, "")) &&
        Number(value.replace(/,/g, "")) > 0),
    "Enter an area more than 0, with at most two decimals.",
  );

const detailsSchema = z.object({
  unitType: z
    .string()
    .trim()
    .max(
      SALES_LIMITS.unitType,
      `Use at most ${String(SALES_LIMITS.unitType)} characters.`,
    ),
  carpetArea: area,
  builtUpArea: area,
  superBuiltUpArea: area,
  areaUnit: z.enum(AREA_UNITS),
});
type DetailsValues = z.infer<typeof detailsSchema>;

function problem(caught: unknown): {
  field: string | null;
  message: string;
} {
  if (caught instanceof QueryHttpError) {
    const raw = (caught.details as { field?: unknown } | undefined)?.field;
    return {
      field: typeof raw === "string" ? raw : null,
      message: caught.message,
    };
  }
  return { field: null, message: "Something went wrong. Please try again." };
}

const AREA_ITEMS = AREA_UNITS.map((unit) => ({
  value: unit,
  label: AREA_UNIT_LABELS[unit],
}));

/**
 * A unit's sales details (CM-1005, ADR CM-0022 §8): Unit type ("2BHK",
 * "Shop"), Carpet area (the RERA basis), Built-up and Super built-up area,
 * each optional, and the area unit. Needs Booking Update.
 */
export function UnitDetailsDialog({
  projectId,
  unit,
  open,
  onOpenChange,
}: {
  projectId: string;
  unit: SalesUnit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const command = useUnitCommand(projectId, unit);
  const [error, setError] = useState<string | undefined>();
  const form = useForm<DetailsValues>({
    resolver: zodResolver(detailsSchema),
    values: {
      unitType: unit.profile.unitType ?? "",
      carpetArea: unit.profile.carpetArea ?? "",
      builtUpArea: unit.profile.builtUpArea ?? "",
      superBuiltUpArea: unit.profile.superBuiltUpArea ?? "",
      areaUnit: unit.profile.areaUnit,
    },
  });
  const errors = form.formState.errors;
  const close = () => {
    setError(undefined);
    form.clearErrors();
    onOpenChange(false);
  };
  const submit = form.handleSubmit(async (values) => {
    setError(undefined);
    const orNull = (value: string) => (value.trim() === "" ? null : value);
    try {
      await command.mutateAsync({
        action: "details",
        body: {
          unitType: orNull(values.unitType),
          carpetArea: orNull(values.carpetArea),
          builtUpArea: orNull(values.builtUpArea),
          superBuiltUpArea: orNull(values.superBuiltUpArea),
          areaUnit: values.areaUnit,
        },
      });
      close();
    } catch (caught) {
      const found = problem(caught);
      if (found.field != null && found.field in values)
        form.setError(found.field as FieldPath<DetailsValues>, {
          message: found.message,
        });
      else setError(found.message);
    }
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unit details · {unit.name}</DialogTitle>
          <DialogDescription>
            {unit.wing.name} · {unit.floor.name}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <FormAlert message={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="unit-type">Unit type</Label>
              <Input
                id="unit-type"
                placeholder="2BHK, Shop"
                aria-invalid={errors.unitType != null}
                {...form.register("unitType")}
              />
              <FieldError message={errors.unitType?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-area-unit">Area unit</Label>
              <Controller
                control={form.control}
                name="areaUnit"
                render={({ field }) => (
                  <Select
                    items={AREA_ITEMS}
                    value={field.value}
                    onValueChange={(value) => {
                      if (value != null) field.onChange(value);
                    }}
                  >
                    <SelectTrigger
                      id="unit-area-unit"
                      className="w-full min-w-0"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      {AREA_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            {(["carpetArea", "builtUpArea", "superBuiltUpArea"] as const).map(
              (name) => (
                <div key={name} className="space-y-1.5">
                  <Label htmlFor={`unit-${name}`}>
                    {AREA_FIELD_LABELS[name]}
                  </Label>
                  <Input
                    id={`unit-${name}`}
                    inputMode="decimal"
                    autoComplete="off"
                    aria-invalid={errors[name] != null}
                    {...form.register(name)}
                  />
                  <FieldError message={errors[name]?.message} />
                </div>
              ),
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const unavailableSchema = z.object({
  reason: z
    .string()
    .refine(
      (value) => (UNAVAILABLE_REASONS as readonly string[]).includes(value),
      "Choose why the unit is not for sale.",
    ),
  note: z
    .string()
    .trim()
    .max(UNIT_NOTE_MAX, `Use at most ${String(UNIT_NOTE_MAX)} characters.`),
});
type UnavailableValues = z.infer<typeof unavailableSchema>;

const REASON_ITEMS = UNAVAILABLE_REASONS.map((reason) => ({
  value: reason,
  label: UNAVAILABLE_REASON_LABELS[reason],
}));

/**
 * Marks a unit **Unavailable** — not for sale — with a reason (Landowner
 * share, Reserved, Not for sale, Other) and a note (CM-0022 §8). A unit on
 * hold or booked is refused (`UNIT_HAS_BOOKING`).
 */
export function UnitUnavailableDialog({
  projectId,
  unit,
  open,
  onOpenChange,
}: {
  projectId: string;
  unit: SalesUnit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const command = useUnitCommand(projectId, unit);
  const [error, setError] = useState<string | undefined>();
  const form = useForm<UnavailableValues>({
    resolver: zodResolver(unavailableSchema),
    // `values`, so a reopened dialog shows the unit's current reason.
    values: {
      reason: unit.profile.unavailableReason ?? "",
      note: unit.profile.unavailableNote ?? "",
    },
  });
  const errors = form.formState.errors;
  const close = () => {
    setError(undefined);
    form.reset();
    onOpenChange(false);
  };
  const submit = form.handleSubmit(async (values) => {
    setError(undefined);
    try {
      await command.mutateAsync({
        action: "unavailable",
        body: {
          reason: values.reason as UnavailableReason,
          note: values.note === "" ? null : values.note,
        },
      });
      close();
    } catch (caught) {
      setError(problem(caught).message);
    }
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark {unit.name} unavailable</DialogTitle>
          <DialogDescription>
            It takes the unit off sale until it is made available again.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <FormAlert message={error} />
          <div className="space-y-1.5">
            <Label htmlFor="unit-unavailable-reason">Reason</Label>
            <Controller
              control={form.control}
              name="reason"
              render={({ field }) => (
                <Select
                  items={REASON_ITEMS}
                  value={field.value === "" ? null : field.value}
                  onValueChange={(value) => {
                    if (value != null) field.onChange(value);
                  }}
                >
                  <SelectTrigger
                    id="unit-unavailable-reason"
                    className="w-full min-w-0"
                    aria-invalid={errors.reason != null}
                  >
                    <SelectValue placeholder="Choose a reason" />
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    {REASON_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError message={errors.reason?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="unit-unavailable-note">Note</Label>
            <Textarea
              id="unit-unavailable-note"
              aria-invalid={errors.note != null}
              {...form.register("note")}
            />
            <FieldError message={errors.note?.message} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Mark unavailable
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
