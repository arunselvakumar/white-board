"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { Controller, useForm, useWatch, type FieldPath } from "react-hook-form";
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
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { localToday } from "@/components/payments/payment-format";
import { QueryHttpError } from "@/src/queries/http";
import { bookingFormOptionsQuery } from "@/src/queries/sales-bookings";
import {
  inquiryFormOptionsQuery,
  useCloseInquiry,
  type InquiryDetail,
} from "@/src/queries/sales-inquiries";
import { SALES_LIMITS } from "@/src/sales/domain/sales-terms";

import { InquirySelect } from "./inquiry-select";
import { SelectControlSkeleton } from "@/components/finance/finance-skeletons";

const schema = z
  .object({
    outcome: z.enum(["converted", "lost"]),
    unitId: z.string(),
    bookingDate: z.string(),
    lostReasonId: z.string(),
    remarks: z
      .string()
      .max(
        SALES_LIMITS.remarks,
        `Use at most ${String(SALES_LIMITS.remarks)} characters.`,
      ),
  })
  .superRefine((value, ctx) => {
    if (value.outcome === "converted" && value.unitId === "")
      ctx.addIssue({
        code: "custom",
        message: "Choose the unit.",
        path: ["unitId"],
      });
    if (value.outcome === "converted" && value.bookingDate === "")
      ctx.addIssue({
        code: "custom",
        message: "Choose the Booking Date.",
        path: ["bookingDate"],
      });
    if (value.outcome === "lost" && value.lostReasonId === "")
      ctx.addIssue({
        code: "custom",
        message: "Choose why it was lost.",
        path: ["lostReasonId"],
      });
  });
type Values = z.infer<typeof schema>;

/** Server codes to the fields they are about. */
const CODE_FIELDS: Record<string, FieldPath<Values>> = {
  UNIT_NOT_FOUND: "unitId",
  UNIT_UNAVAILABLE: "unitId",
  UNIT_BOOKED: "unitId",
  BACKDATED_CREATE_BLOCKED: "bookingDate",
  FINANCIAL_PERIOD_CLOSED: "bookingDate",
  LOST_REASON_NOT_FOUND: "lostReasonId",
  LOST_REASON_DISABLED: "lostReasonId",
  INQUIRY_LOST_REMARKS_TOO_LONG: "remarks",
};

/** The units that can be booked now, by Wing (Booking Create). */
function UnitPicker({
  projectId,
  value,
  onChange,
  invalid,
}: {
  projectId: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
}) {
  const { data } = useSuspenseQuery(bookingFormOptionsQuery(projectId));
  const items = data.wings.flatMap((wing) =>
    wing.units.map((unit) => ({
      value: unit.id,
      label: `${wing.name} ${unit.name}`,
    })),
  );
  if (items.length === 0)
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
        No unit can be booked now: every unit is booked, on hold or unavailable.
      </p>
    );
  return (
    <Select
      items={items}
      value={value === "" ? null : value}
      onValueChange={(next) => {
        if (next != null) onChange(next);
      }}
    >
      <SelectTrigger
        id="close-unit"
        className="w-full min-w-0"
        aria-invalid={invalid}
      >
        <SelectValue placeholder="Choose a unit" />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {data.wings
          .filter((wing) => wing.units.length > 0)
          .map((wing) => (
            <SelectGroup key={wing.id}>
              <SelectLabel>{wing.name}</SelectLabel>
              {wing.units.map((unit) => (
                <SelectItem key={unit.id} value={unit.id}>
                  {`${wing.name} ${unit.name}`}
                  <span className="text-muted-foreground text-xs">
                    {unit.floorName}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
      </SelectContent>
    </Select>
  );
}

/**
 * **Close** an Open inquiry (CM-1007, ADR CM-0022 §6): as **Converted** —
 * a unit that can be booked now (grouped by Wing) and the Booking Date
 * (today unless changed); saving books the unit for this lead in the same
 * save — or as **Lost**, with a Lost Reason and optional remarks.
 * Converted needs Booking Create as well; without it only Lost is offered.
 */
export function InquiryCloseDialog({
  projectId,
  inquiry,
  open,
  onOpenChange,
  today = localToday(),
}: {
  projectId: string;
  inquiry: InquiryDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today?: string;
}) {
  const { data: options } = useSuspenseQuery(
    inquiryFormOptionsQuery(projectId),
  );
  const close = useCloseInquiry(inquiry.id);
  const [error, setError] = useState<string | null>(null);
  const canConvert = inquiry.actions.convert;
  const fresh = (): Values => ({
    outcome: canConvert ? "converted" : "lost",
    unitId: "",
    bookingDate: today,
    lostReasonId: "",
    remarks: "",
  });
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: fresh(),
  });
  const errors = form.formState.errors;
  const outcome = useWatch({ control: form.control, name: "outcome" });

  const dismiss = () => {
    form.reset(fresh());
    setError(null);
    onOpenChange(false);
  };

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await close.mutateAsync(
        values.outcome === "converted"
          ? {
              kind: "convert",
              unitId: values.unitId,
              bookingDate: values.bookingDate,
              expectedUpdatedAt: inquiry.updatedAt,
            }
          : {
              kind: "lose",
              lostReasonId: values.lostReasonId,
              remarks:
                values.remarks.trim() === "" ? null : values.remarks.trim(),
              expectedUpdatedAt: inquiry.updatedAt,
            },
      );
      dismiss();
    } catch (caught) {
      if (caught instanceof QueryHttpError) {
        const field = CODE_FIELDS[caught.code];
        if (field != null) form.setError(field, { message: caught.message });
        else setError(caught.message);
        return;
      }
      setError("Something went wrong. Please try again.");
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="max-h-[90dvh] grid-cols-1 overflow-y-auto sm:max-w-lg">
        <form
          noValidate
          aria-label="Close inquiry"
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle className="break-words">{`Close ${inquiry.name}`}</DialogTitle>
            <DialogDescription>
              {canConvert
                ? "Converted books the unit for this lead now. Lost keeps why."
                : "Close it as Lost. Converting needs Booking create too."}
            </DialogDescription>
          </DialogHeader>
          <Controller
            control={form.control}
            name="outcome"
            render={({ field }) => (
              <RadioGroup
                aria-label="Outcome"
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value);
                }}
                className="grid grid-cols-2 gap-3"
              >
                {(
                  [
                    ["converted", "Converted", !canConvert],
                    ["lost", "Lost", false],
                  ] as const
                ).map(([value, label, disabled]) => (
                  <div
                    key={value}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2"
                  >
                    <RadioGroupItem
                      id={`close-${value}`}
                      value={value}
                      disabled={disabled}
                    />
                    <Label htmlFor={`close-${value}`} className="font-normal">
                      {label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}
          />
          {outcome === "converted" ? (
            <div className="grid min-w-0 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="close-unit">Unit</Label>
                <Suspense
                  fallback={
                    <SelectControlSkeleton
                      label="Loading units"
                      className="h-8 w-full"
                    />
                  }
                >
                  <Controller
                    control={form.control}
                    name="unitId"
                    render={({ field }) => (
                      <UnitPicker
                        projectId={projectId}
                        value={field.value}
                        onChange={field.onChange}
                        invalid={errors.unitId != null}
                      />
                    )}
                  />
                </Suspense>
                <FieldError message={errors.unitId?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="close-booking-date">Booking Date</Label>
                <Input
                  id="close-booking-date"
                  type="date"
                  max={today}
                  aria-invalid={errors.bookingDate != null}
                  {...form.register("bookingDate")}
                />
                <FieldError message={errors.bookingDate?.message} />
              </div>
            </div>
          ) : (
            <div className="grid min-w-0 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="close-lost-reason">Lost Reason</Label>
                <Controller
                  control={form.control}
                  name="lostReasonId"
                  render={({ field }) => (
                    <InquirySelect
                      id="close-lost-reason"
                      value={field.value}
                      onChange={field.onChange}
                      invalid={errors.lostReasonId != null}
                      items={options.lostReasons.map((reason) => ({
                        value: reason.id,
                        label: reason.name,
                      }))}
                    />
                  )}
                />
                <FieldError message={errors.lostReasonId?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="close-remarks">Remarks</Label>
                <Textarea
                  id="close-remarks"
                  rows={3}
                  aria-invalid={errors.remarks != null}
                  {...form.register("remarks")}
                />
                <FieldError message={errors.remarks?.message} />
              </div>
            </div>
          )}
          <FormAlert message={error ?? undefined} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={dismiss}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? "Saving…"
                : outcome === "converted"
                  ? "Book and close"
                  : "Close as Lost"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
