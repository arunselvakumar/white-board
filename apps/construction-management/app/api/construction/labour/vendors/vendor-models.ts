import { z } from "zod";

import type {
  VendorOptionReadModel,
  VendorReadModel,
  VendorShiftReadModel,
  VendorSummaryReadModel,
} from "@/src/labour/application/vendor-handlers";
import { photoUrl } from "@/app/api/construction/labour/_party-files/party-file-models";

export const VENDORS_PATH = "/api/construction/labour/vendors";

/** A rate card shift as Add/Edit Vendor sends it (CM-209). Amounts are paise. */
export const vendorShiftInputModel = z.object({
  /** An existing shift's id keeps it; leave it out for a new shift. */
  id: z.uuid().nullable().optional(),
  name: z.string().max(200),
  /** `HH:MM`, 24-hour. */
  startTime: z.string().max(5).nullable().optional(),
  endTime: z.string().max(5).nullable().optional(),
  rates: z
    .array(
      z.object({
        labourCategoryId: z.uuid(),
        /** Paise per head per full day; null keeps the current rate. */
        ratePerDay: z.int().nullable(),
        /** Paise per overtime hour; null keeps the current rate. */
        overtimePerHour: z.int().nullable(),
      }),
    )
    .max(50),
});

export const vendorWriteFields = {
  name: z.string().max(500),
  /** `YYYY-MM-DD`. */
  joiningDate: z.string().max(10),
  /** Any Indian mobile format; stored E.164. */
  contactNumber: z.string().max(30).nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
  projectIds: z.array(z.uuid()).max(500).optional().default([]),
  /** The whole rate card; shifts left out are removed. */
  shifts: z.array(vendorShiftInputModel).max(20).optional().default([]),
  /**
   * Paise, signed: positive is owed to the vendor, negative an advance given
   * before the app. Null keeps the stored amount.
   */
  openingBalance: z.int().nullable().optional(),
};

const vendorProjectModel = z.object({ id: z.uuid(), name: z.string() });

export const ConstructionLabourVendorShiftResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  rates: z.array(
    z.object({
      labourCategoryId: z.uuid(),
      /** Null when the category was deleted from Masters. */
      labourCategoryName: z.string().nullable(),
      /** Paise; null without the Financial flag. */
      ratePerDay: z.int().nullable(),
      /** Paise; null without the Financial flag. */
      overtimePerHour: z.int().nullable(),
    }),
  ),
});

export type ConstructionLabourVendorShiftResponseModel = z.infer<
  typeof ConstructionLabourVendorShiftResponseModel
>;

export const ConstructionLabourVendorResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  joiningDate: z.iso.date(),
  contactNumber: z.string().nullable(),
  address: z.string().nullable(),
  isActive: z.boolean(),
  /** At least one shift with a category rate; attendance needs it. */
  hasRateCard: z.boolean(),
  /** Same-origin URL of the photo (versioned), or null. */
  photoUrl: z.string().nullable(),
  projects: z.array(vendorProjectModel),
  shifts: z.array(ConstructionLabourVendorShiftResponseModel),
  /** Paise; null without the Financial flag. */
  openingBalance: z.int().nullable(),
  /** Paise owed to the vendor today; null without the Financial flag. */
  balance: z.int().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ConstructionLabourVendorResponseModel = z.infer<
  typeof ConstructionLabourVendorResponseModel
>;

export const ConstructionLabourVendorSummaryResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  contactNumber: z.string().nullable(),
  isActive: z.boolean(),
  hasRateCard: z.boolean(),
  shiftCount: z.int().nonnegative(),
  projects: z.array(vendorProjectModel),
  /** Paise owed to the vendor today; null without the Financial flag. */
  balance: z.int().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ConstructionLabourVendorSummaryResponseModel = z.infer<
  typeof ConstructionLabourVendorSummaryResponseModel
>;

export const ConstructionLabourVendorOptionResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  hasRateCard: z.boolean(),
  shifts: z.array(ConstructionLabourVendorShiftResponseModel),
});

export type ConstructionLabourVendorOptionResponseModel = z.infer<
  typeof ConstructionLabourVendorOptionResponseModel
>;

function money(value: number, financial: boolean): number | null {
  return financial ? value : null;
}

function toShifts(
  shifts: readonly VendorShiftReadModel[],
  financial: boolean,
): ConstructionLabourVendorShiftResponseModel[] {
  return shifts.map((shift) => ({
    id: shift.id,
    name: shift.name,
    startTime: shift.startTime,
    endTime: shift.endTime,
    rates: shift.rates.map((rate) => ({
      labourCategoryId: rate.labourCategoryId,
      labourCategoryName: rate.labourCategoryName,
      ratePerDay: money(rate.ratePerDay, financial),
      overtimePerHour: money(rate.overtimePerHour, financial),
    })),
  }));
}

export function toVendorResponse(
  item: VendorReadModel,
  financial: boolean,
): ConstructionLabourVendorResponseModel {
  return {
    id: item.id,
    name: item.name,
    joiningDate: item.joiningDate,
    contactNumber: item.contactNumber,
    address: item.address,
    isActive: item.isActive,
    hasRateCard: item.hasRateCard,
    photoUrl: photoUrl(VENDORS_PATH, item.id, item.photoKey),
    projects: item.projects,
    shifts: toShifts(item.shifts, financial),
    openingBalance: money(item.openingBalance, financial),
    balance: money(item.balance, financial),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function toVendorSummaryResponse(
  item: VendorSummaryReadModel,
  financial: boolean,
): ConstructionLabourVendorSummaryResponseModel {
  return {
    id: item.id,
    name: item.name,
    contactNumber: item.contactNumber,
    isActive: item.isActive,
    hasRateCard: item.hasRateCard,
    shiftCount: item.shiftCount,
    projects: item.projects,
    balance: money(item.balance, financial),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function toVendorOptionResponse(
  item: VendorOptionReadModel,
  financial: boolean,
): ConstructionLabourVendorOptionResponseModel {
  return {
    id: item.id,
    name: item.name,
    hasRateCard: item.hasRateCard,
    shifts: toShifts(item.shifts, financial),
  };
}
