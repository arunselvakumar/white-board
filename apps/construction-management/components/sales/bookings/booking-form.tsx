"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Controller, useForm, useWatch, type FieldPath } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { RadioGroup } from "@repo/ui/components/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";
import { SkeletonText } from "@repo/ui/components/skeleton-kit";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { localToday } from "@/components/payments/payment-format";
import { SalesPendingFilesField } from "@/components/sales/documents/sales-pending-files-field";
import { useUploadPendingSalesFiles } from "@/components/sales/documents/use-upload-pending-sales-files";
import { RadioCard } from "@/components/site-work/equipment/radio-card";
import { QueryHttpError } from "@/src/queries/http";
import {
  bookingFormOptionsQuery,
  bookingsPath,
  useCreateBooking,
  useUpdateBooking,
  type BookingDetail,
  type BookingFormOptions,
} from "@/src/queries/sales-bookings";
import { SALES_LIMITS } from "@/src/sales/domain/sales-terms";
import { withUploadFailed } from "@/components/sales/documents/upload-failed";

const limit = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${String(max)} characters.`);

const schema = z
  .object({
    wingId: z.string(),
    unitId: z.string(),
    status: z.enum(["on_hold", "booked"]),
    bookingDate: z.string().min(1, "Choose the Booking Date."),
    holdUntil: z.string(),
    customerName: limit(SALES_LIMITS.name).min(1, "Enter the customer's name."),
    customerMobile: z.string().trim().max(30),
    customerEmail: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        "Enter a valid email address.",
      ),
    customerAddress: limit(SALES_LIMITS.address),
    referredByName: limit(SALES_LIMITS.referredBy),
    referredByContact: z.string().trim().max(30),
    remarks: limit(SALES_LIMITS.remarks),
    /** Picked on a new booking; uploaded once it is saved. */
    bookingForm: z.custom<File[]>(),
    photos: z.custom<File[]>(),
  })
  .superRefine((value, ctx) => {
    if (value.unitId === "")
      ctx.addIssue({
        code: "custom",
        message: "Choose the unit.",
        path: ["unitId"],
      });
    if (
      value.status === "on_hold" &&
      value.holdUntil !== "" &&
      value.holdUntil < value.bookingDate
    )
      ctx.addIssue({
        code: "custom",
        message: "Hold until cannot be before the Booking Date.",
        path: ["holdUntil"],
      });
  });
type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, FieldPath<Values>> = {
  unitId: "unitId",
  bookingDate: "bookingDate",
  holdUntil: "holdUntil",
  customerName: "customerName",
  customerMobile: "customerMobile",
  customerEmail: "customerEmail",
  customerAddress: "customerAddress",
  referredByName: "referredByName",
  referredByContact: "referredByContact",
  remarks: "remarks",
};

/** Refusals about the unit and the Booking Date. */
const UNIT_CODES = new Set([
  "UNIT_BOOKED",
  "UNIT_UNAVAILABLE",
  "UNIT_NOT_FOUND",
]);
const DATE_CODES = new Set([
  "BACKDATED_CREATE_BLOCKED",
  "BACKDATED_EDIT_BLOCKED",
  "FINANCIAL_PERIOD_CLOSED",
]);

function defaults(
  booking: BookingDetail | undefined,
  start: { unitId: string | null; status: "on_hold" | "booked" },
  options: BookingFormOptions | undefined,
): Values {
  const wingId =
    booking?.wing.id ??
    options?.wings.find((wing) =>
      wing.units.some((unit) => unit.id === start.unitId),
    )?.id ??
    "";
  return {
    wingId,
    unitId: booking?.unit.id ?? (wingId === "" ? "" : (start.unitId ?? "")),
    status:
      booking?.storedStatus === "booked"
        ? "booked"
        : booking == null
          ? start.status
          : "on_hold",
    bookingDate: booking?.bookingDate ?? localToday(),
    holdUntil: booking?.holdUntil ?? "",
    customerName: booking?.customerName ?? "",
    customerMobile: booking?.customerMobile ?? "",
    customerEmail: booking?.customerEmail ?? "",
    customerAddress: booking?.customerAddress ?? "",
    referredByName: booking?.referredByName ?? "",
    referredByContact: booking?.referredByContact ?? "",
    remarks: booking?.remarks ?? "",
    bookingForm: [],
    photos: [],
  };
}

function Field({
  id,
  label,
  error,
  children,
  className,
  required = false,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={`min-w-0 space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children}
      <FieldError message={error} />
    </div>
  );
}

/**
 * Hold or Book a unit, or edit a booking (CM-1006, ADR CM-0022 §7): the
 * unit (its Wing first; only units that can be booked now), On Hold or
 * Booked, Booking Date (not after today; back-dated control), Hold until
 * for a hold, the customer's name, mobile, email and address, Referred By
 * name and contact, remarks; on a new booking its Booking Form and photos,
 * uploaded once it is saved. An edit keeps the unit, status and Hold
 * until (Confirm and Extend hold change those).
 */
export function BookingForm({
  projectId,
  booking,
  unitId = null,
  status = "on_hold",
}: {
  projectId: string;
  /** Edit this booking. */
  booking?: BookingDetail;
  /** A new booking for this unit (from the unit panel). */
  unitId?: string | null;
  status?: "on_hold" | "booked";
}) {
  const router = useRouter();
  const editing = booking != null;
  const options = useQuery({
    ...bookingFormOptionsQuery(projectId),
    enabled: !editing,
  }).data;
  const create = useCreateBooking();
  const update = useUpdateBooking(booking?.id ?? "");
  const uploads = useUploadPendingSalesFiles("booking");
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults(booking, { unitId, status }, options),
    values: editing
      ? undefined
      : defaults(booking, { unitId, status }, options),
    resetOptions: { keepDirtyValues: true },
  });
  const errors = form.formState.errors;
  const wingId = useWatch({ control: form.control, name: "wingId" });
  const chosenStatus = useWatch({ control: form.control, name: "status" });
  const wings = options?.wings ?? [];
  const units = wings.find((wing) => wing.id === wingId)?.units ?? [];
  const missingUnit =
    !editing &&
    unitId != null &&
    options != null &&
    !wings.some((wing) => wing.units.some((unit) => unit.id === unitId));

  const submit = form.handleSubmit(async (input) => {
    setError(null);
    const orNull = (value: string) =>
      value.trim() === "" ? null : value.trim();
    const body = {
      bookingDate: input.bookingDate,
      customerName: input.customerName.trim(),
      customerMobile: orNull(input.customerMobile),
      customerEmail: orNull(input.customerEmail),
      customerAddress: orNull(input.customerAddress),
      referredByName: orNull(input.referredByName),
      referredByContact: orNull(input.referredByContact),
      remarks: orNull(input.remarks),
    };
    try {
      const saved = editing
        ? await update.mutateAsync({
            ...body,
            expectedUpdatedAt: booking.updatedAt,
          })
        : await create.mutateAsync({
            ...body,
            projectId,
            unitId: input.unitId,
            status: input.status,
            holdUntil:
              input.status === "on_hold" ? orNull(input.holdUntil) : null,
          });
      setLeaving(true);
      // A file that does not go up can be added again on the booking's page.
      const { failed } = editing
        ? { failed: [] }
        : await uploads.uploadAll(saved.id, [
            { role: "booking_form", files: input.bookingForm },
            { role: "photo", files: input.photos },
          ]);
      router.push(withUploadFailed(bookingsPath(projectId, saved.id), failed));
    } catch (caught) {
      setLeaving(false);
      if (caught instanceof QueryHttpError) {
        if (UNIT_CODES.has(caught.code)) {
          form.setError("unitId", { message: caught.message });
          return;
        }
        if (DATE_CODES.has(caught.code)) {
          form.setError("bookingDate", { message: caught.message });
          return;
        }
        const raw = (caught.details as { field?: unknown } | undefined)?.field;
        const field = typeof raw === "string" ? SERVER_FIELDS[raw] : undefined;
        if (field != null) {
          form.setError(field, { message: caught.message });
          return;
        }
        setError(caught.message);
        return;
      }
      setError("Something went wrong. Please try again.");
    }
  });

  const busy = form.formState.isSubmitting || uploads.uploading || leaving;
  const wingItems = wings.map((wing) => ({ value: wing.id, label: wing.name }));
  const unitItems = units.map((unit) => ({
    value: unit.id,
    label: `${unit.name} · ${unit.floorName}`,
  }));

  return (
    <form
      noValidate
      aria-label={editing ? "Edit booking" : "New booking"}
      className="w-full max-w-4xl space-y-6"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <FormAlert message={error ?? undefined} />
      <section
        aria-label="Unit and dates"
        className="bg-card space-y-4 rounded-lg border p-4"
      >
        {editing ? (
          <p className="text-sm">
            <span className="font-medium">
              {booking.wing.name} · {booking.unit.name}
            </span>{" "}
            <span className="text-muted-foreground">
              ({booking.unit.floorName})
            </span>
          </p>
        ) : (
          <>
            {missingUnit && (
              <p className="text-sm">
                That unit can no longer be booked. Choose another.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="booking-wing" label="Wing" required>
                <Controller
                  control={form.control}
                  name="wingId"
                  render={({ field }) => (
                    <Select
                      items={wingItems}
                      value={field.value === "" ? null : field.value}
                      onValueChange={(next) => {
                        if (next == null) return;
                        field.onChange(next);
                        form.setValue("unitId", "");
                      }}
                    >
                      <SelectTrigger
                        id="booking-wing"
                        className="w-full min-w-0"
                        aria-required
                      >
                        <SelectValue
                          placeholder={
                            options == null ? (
                              <SkeletonText width="6rem" />
                            ) : wings.length === 0 ? (
                              "No unit can be booked"
                            ) : (
                              "Choose a Wing"
                            )
                          }
                        />
                      </SelectTrigger>
                      <SelectContent align="start" alignItemWithTrigger={false}>
                        {wingItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field
                id="booking-unit"
                label="Unit"
                error={errors.unitId?.message}
                required
              >
                <Controller
                  control={form.control}
                  name="unitId"
                  render={({ field }) => (
                    <Select
                      items={unitItems}
                      value={field.value === "" ? null : field.value}
                      onValueChange={(next) => {
                        if (next != null) field.onChange(next);
                      }}
                    >
                      <SelectTrigger
                        id="booking-unit"
                        className="w-full min-w-0"
                        aria-required
                        aria-invalid={errors.unitId != null}
                        disabled={wingId === ""}
                      >
                        <SelectValue placeholder="Choose a unit" />
                      </SelectTrigger>
                      <SelectContent align="start" alignItemWithTrigger={false}>
                        {unitItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <RadioGroup
                  aria-label="Booking status"
                  aria-required
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value as Values["status"]);
                  }}
                  className="grid gap-3 sm:grid-cols-2"
                >
                  <RadioCard
                    value="on_hold"
                    title="Hold"
                    hint="Keep the unit for the customer, until a date if you like."
                    onSelect={field.onChange}
                  />
                  <RadioCard
                    value="booked"
                    title="Book"
                    hint="The customer has booked the unit."
                    onSelect={field.onChange}
                  />
                </RadioGroup>
              )}
            />
          </>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="booking-date"
            label="Booking Date"
            error={errors.bookingDate?.message}
            required
          >
            <Input
              id="booking-date"
              type="date"
              max={localToday()}
              aria-required
              aria-invalid={errors.bookingDate != null}
              {...form.register("bookingDate")}
            />
          </Field>
          {!editing && chosenStatus === "on_hold" && (
            <Field
              id="booking-hold-until"
              label="Hold until"
              error={errors.holdUntil?.message}
            >
              <Input
                id="booking-hold-until"
                type="date"
                aria-invalid={errors.holdUntil != null}
                {...form.register("holdUntil")}
              />
            </Field>
          )}
        </div>
      </section>

      <section
        aria-label="Customer details"
        className="bg-card grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
      >
        <Field
          id="booking-customer"
          label="Customer name"
          error={errors.customerName?.message}
          required
        >
          <Input
            id="booking-customer"
            autoComplete="off"
            aria-required
            aria-invalid={errors.customerName != null}
            {...form.register("customerName")}
          />
        </Field>
        <Field
          id="booking-mobile"
          label="Mobile"
          error={errors.customerMobile?.message}
        >
          <Input
            id="booking-mobile"
            type="tel"
            inputMode="tel"
            aria-invalid={errors.customerMobile != null}
            {...form.register("customerMobile")}
          />
        </Field>
        <Field
          id="booking-email"
          label="Email"
          error={errors.customerEmail?.message}
        >
          <Input
            id="booking-email"
            type="email"
            aria-invalid={errors.customerEmail != null}
            {...form.register("customerEmail")}
          />
        </Field>
        <Field
          id="booking-address"
          label="Address"
          error={errors.customerAddress?.message}
          className="sm:col-span-2"
        >
          <Textarea
            id="booking-address"
            aria-invalid={errors.customerAddress != null}
            {...form.register("customerAddress")}
          />
        </Field>
        <Field
          id="booking-referred"
          label="Referred By"
          error={errors.referredByName?.message}
        >
          <Input id="booking-referred" {...form.register("referredByName")} />
        </Field>
        <Field
          id="booking-referred-contact"
          label="Referred By contact"
          error={errors.referredByContact?.message}
        >
          <Input
            id="booking-referred-contact"
            type="tel"
            inputMode="tel"
            aria-invalid={errors.referredByContact != null}
            {...form.register("referredByContact")}
          />
        </Field>
        <Field
          id="booking-remarks"
          label="Remarks"
          error={errors.remarks?.message}
          className="sm:col-span-2"
        >
          <Textarea id="booking-remarks" {...form.register("remarks")} />
        </Field>
      </section>

      {!editing && (
        <section
          aria-label="Files"
          className="bg-card grid min-w-0 gap-4 rounded-lg border p-4 lg:grid-cols-2"
        >
          <Controller
            control={form.control}
            name="bookingForm"
            render={({ field }) => (
              <SalesPendingFilesField
                documentType="booking"
                role="booking_form"
                label="Booking Form"
                value={field.value}
                onChange={field.onChange}
                disabled={busy}
              />
            )}
          />
          <Controller
            control={form.control}
            name="photos"
            render={({ field }) => (
              <SalesPendingFilesField
                documentType="booking"
                role="photo"
                label="Photos"
                value={field.value}
                onChange={field.onChange}
                disabled={busy}
              />
            )}
          />
        </section>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            router.back();
          }}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {uploads.uploading
            ? "Uploading files…"
            : editing
              ? "Save"
              : chosenStatus === "booked"
                ? "Book unit"
                : "Hold unit"}
        </Button>
      </div>
    </form>
  );
}
