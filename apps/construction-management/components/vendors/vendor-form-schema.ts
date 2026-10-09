import { normalizeMobile } from "@repo/auth/construction/react";
import type { FieldPath } from "react-hook-form";
import { z } from "zod";

import {
  isRupees,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import { QueryHttpError } from "@/src/queries/http";
import type { VendorInput, VendorResponse } from "@/src/queries/vendors";

const rateSchema = z.object({
  labourCategoryId: z.string(),
  /** Rupees as typed. */
  ratePerDay: z.string(),
  overtimePerHour: z.string(),
});

const shiftSchema = z.object({
  /** The stored shift's id; null for a new shift. */
  shiftId: z.string().nullable(),
  name: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  rates: z.array(rateSchema),
});

const baseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the Vendor name")
    .max(120, "Use at most 120 characters"),
  joiningDate: z.string().min(1, "Enter the joining date"),
  contactNumber: z
    .string()
    .trim()
    .refine((value) => value === "" || normalizeMobile(value) != null, {
      message: "Enter a valid 10-digit mobile number",
    }),
  address: z.string().max(500, "Use at most 500 characters"),
  projectIds: z.array(z.string()),
  /** Rupees as typed; negative for an advance given before the app. */
  openingBalance: z.string(),
  shifts: z.array(shiftSchema),
});

export type VendorFormValues = z.infer<typeof baseSchema>;

/** Client checks; the server repeats every rule (`modules/08`). */
export function vendorFormSchema(showAmounts: boolean) {
  return baseSchema.superRefine((values, ctx) => {
    if (
      showAmounts &&
      values.openingBalance.trim() !== "" &&
      !isRupees(values.openingBalance, true)
    )
      ctx.addIssue({
        code: "custom",
        path: ["openingBalance"],
        message: "Enter an amount in rupees, like 25000 or -5000",
      });
    const names = new Set<string>();
    values.shifts.forEach((shift, shiftIndex) => {
      const name = shift.name.trim().toLowerCase();
      if (name === "")
        ctx.addIssue({
          code: "custom",
          path: ["shifts", shiftIndex, "name"],
          message: "Enter the shift name",
        });
      else if (names.has(name))
        ctx.addIssue({
          code: "custom",
          path: ["shifts", shiftIndex, "name"],
          message: "Another shift has this name",
        });
      names.add(name);
      if (shift.rates.length === 0)
        ctx.addIssue({
          code: "custom",
          path: ["shifts", shiftIndex, "rates", "root"],
          message: "Add at least one Labour Category",
        });
      const categories = new Set<string>();
      shift.rates.forEach((rate, rateIndex) => {
        const at = ["shifts", shiftIndex, "rates", rateIndex];
        if (rate.labourCategoryId === "")
          ctx.addIssue({
            code: "custom",
            path: [...at, "labourCategoryId"],
            message: "Choose a Labour Category",
          });
        else if (categories.has(rate.labourCategoryId))
          ctx.addIssue({
            code: "custom",
            path: [...at, "labourCategoryId"],
            message: "This Labour Category is already on this shift",
          });
        categories.add(rate.labourCategoryId);
        if (!showAmounts) return;
        if (!isRupees(rate.ratePerDay))
          ctx.addIssue({
            code: "custom",
            path: [...at, "ratePerDay"],
            message: "Enter the rate per day",
          });
        if (
          rate.overtimePerHour.trim() !== "" &&
          !isRupees(rate.overtimePerHour)
        )
          ctx.addIssue({
            code: "custom",
            path: [...at, "overtimePerHour"],
            message: "Enter an amount in rupees",
          });
      });
    });
  });
}

export function emptyRate(): VendorFormValues["shifts"][number]["rates"][number] {
  return { labourCategoryId: "", ratePerDay: "", overtimePerHour: "" };
}

export function emptyShift(index: number): VendorFormValues["shifts"][number] {
  return {
    shiftId: null,
    name: `Shift ${String(index + 1)}`,
    startTime: "",
    endTime: "",
    rates: [emptyRate()],
  };
}

function today(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA").format(new Date());
}

function nationalMobile(value: string | null): string {
  if (value == null) return "";
  return value.startsWith("+91") ? value.slice(3) : value;
}

export function vendorFormDefaults(
  vendor: VendorResponse | null,
): VendorFormValues {
  if (vendor == null)
    return {
      name: "",
      joiningDate: today(),
      contactNumber: "",
      address: "",
      projectIds: [],
      openingBalance: "",
      shifts: [emptyShift(0)],
    };
  return {
    name: vendor.name,
    joiningDate: vendor.joiningDate,
    contactNumber: nationalMobile(vendor.contactNumber),
    address: vendor.address ?? "",
    projectIds: vendor.projects.map((project) => project.id),
    openingBalance:
      vendor.openingBalance == null || vendor.openingBalance === 0
        ? ""
        : paiseToRupees(vendor.openingBalance),
    shifts: vendor.shifts.map((shift) => ({
      shiftId: shift.id,
      name: shift.name,
      startTime: shift.startTime ?? "",
      endTime: shift.endTime ?? "",
      rates: shift.rates.map((rate) => ({
        labourCategoryId: rate.labourCategoryId,
        ratePerDay: paiseToRupees(rate.ratePerDay),
        overtimePerHour: paiseToRupees(rate.overtimePerHour),
      })),
    })),
  };
}

function blankToNull(value: string): string | null {
  const text = value.trim();
  return text === "" ? null : text;
}

/** Form values as the create/update body: paise, nulls for amounts hidden by Financial. */
export function vendorPayload(
  values: VendorFormValues,
  showAmounts: boolean,
): Required<Omit<VendorInput, "contactNumber" | "address">> & {
  contactNumber: string | null;
  address: string | null;
} {
  return {
    name: values.name.trim(),
    joiningDate: values.joiningDate,
    contactNumber: blankToNull(values.contactNumber),
    address: blankToNull(values.address),
    projectIds: values.projectIds,
    shifts: values.shifts.map((shift) => ({
      id: shift.shiftId,
      name: shift.name.trim(),
      startTime: blankToNull(shift.startTime),
      endTime: blankToNull(shift.endTime),
      rates: shift.rates.map((rate) => ({
        labourCategoryId: rate.labourCategoryId,
        ratePerDay: showAmounts ? rupeesToPaise(rate.ratePerDay) : null,
        overtimePerHour: showAmounts
          ? (rupeesToPaise(rate.overtimePerHour) ?? 0)
          : null,
      })),
    })),
    openingBalance: showAmounts
      ? (rupeesToPaise(values.openingBalance) ?? 0)
      : null,
  };
}

const SERVER_FIELDS: Record<string, FieldPath<VendorFormValues>> = {
  VENDOR_NAME_REQUIRED: "name",
  VENDOR_NAME_TOO_LONG: "name",
  VENDOR_JOINING_DATE_INVALID: "joiningDate",
  VENDOR_CONTACT_NUMBER_INVALID: "contactNumber",
  VENDOR_ADDRESS_TOO_LONG: "address",
  VENDOR_OPENING_BALANCE_INVALID: "openingBalance",
};

type Details = {
  shiftIndex?: number;
  rateIndex?: number;
  field?: string;
  labourCategoryId?: string;
};

/**
 * The form field a server error belongs to (`SERVER_FIELDS` plus the rate
 * card's `details`), or null for a form-level message.
 */
export function vendorErrorField(
  error: unknown,
  values: VendorFormValues,
): FieldPath<VendorFormValues> | null {
  if (!(error instanceof QueryHttpError)) return null;
  const direct = SERVER_FIELDS[error.code];
  if (direct != null) return direct;
  const details = (error.details ?? {}) as Details;
  if (details.labourCategoryId != null) {
    for (const [shiftIndex, shift] of values.shifts.entries()) {
      const rateIndex = shift.rates.findIndex(
        (rate) => rate.labourCategoryId === details.labourCategoryId,
      );
      if (rateIndex >= 0)
        return `shifts.${String(shiftIndex)}.rates.${String(rateIndex)}.labourCategoryId` as FieldPath<VendorFormValues>;
    }
  }
  if (details.shiftIndex == null) return null;
  const shift = `shifts.${String(details.shiftIndex)}`;
  if (details.rateIndex != null) {
    const field =
      details.field ??
      (error.code === "DUPLICATE_SHIFT_CATEGORY"
        ? "labourCategoryId"
        : "ratePerDay");
    return `${shift}.rates.${String(details.rateIndex)}.${field}` as FieldPath<VendorFormValues>;
  }
  if (error.code === "SHIFT_RATES_REQUIRED")
    return `${shift}.rates.root` as FieldPath<VendorFormValues>;
  return `${shift}.${details.field ?? "name"}` as FieldPath<VendorFormValues>;
}
