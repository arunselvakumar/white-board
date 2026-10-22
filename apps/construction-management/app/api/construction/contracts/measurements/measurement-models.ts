import { z } from "zod";

import {
  FileDownloadQueryModel,
  UploadKeyQueryModel,
  presignUploadRequestModel,
  presignUploadResponseModel,
  startUploadResponseModel,
} from "@/app/api/_lib/attachments";
import type {
  MeasurementDetail,
  MeasurementFormOptions,
  MeasurementItemFacts,
  MeasurementQuantities,
  MeasurementSheetView,
} from "@/src/contracts/application/measurement-handlers";
import {
  MEASUREMENT_PHOTO_MAX_BYTES,
  MEASUREMENT_PHOTOS_MAX,
  type MeasurementPhotoView,
} from "@/src/contracts/application/measurement-photos";
import type { MeasurementCursor } from "@/src/contracts/application/measurement-ports";
import { quantityText } from "@/src/contracts/domain/boq";
import {
  MEASUREMENT_STATUSES,
  SIDES,
} from "@/src/contracts/domain/contract-terms";
import {
  fixedDecimal,
  PERCENT_SCALE,
} from "@/src/contracts/domain/item-analysis";
import {
  MEASUREMENT_PARTY_NAME_MAX,
  MEASUREMENT_PARTY_ROLE_MAX,
  MEASUREMENT_REMARKS_MAX,
  MEASUREMENT_ROW_DESCRIPTION_MAX,
  MEASUREMENT_ROWS_MAX,
  MEASUREMENT_TITLE_MAX,
} from "@/src/contracts/domain/measurement";
import { FLAGS } from "@/src/shared-kernel/access";
import { isCalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { isUuid } from "@/src/shared-kernel/ids";
import { LOCATION_TYPES } from "@/src/shared-kernel/location-ref";

export const MEASUREMENTS_PATH = "/api/construction/contracts/measurements";

const decimalInput = z.union([z.string().trim().max(30), z.number()]);
const optionalExpected = z.iso
  .datetime()
  .optional()
  .describe(
    "The sheet's `updatedAt` as loaded; when sent, a stale one is refused with 409 MEASUREMENT_CHANGED.",
  );
const reason = (code: string) =>
  z
    .string()
    .max(2000)
    .describe(`Required, at most 500 characters (400 ${code}).`);
const quantity = (what: string) =>
  z.string().describe(`${what} Four decimals, as a string ("12.5000").`);

const locationType = z.enum(
  LOCATION_TYPES.map((item) => item.key) as [
    "wing",
    "amenity",
    "common_development",
    "location",
  ],
);

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const ConstructionContractsMeasurementParamsModel = z.object({
  id: z.uuid(),
});

export const ConstructionContractsMeasurementPhotoParamsModel = z.object({
  id: z.uuid(),
  photoId: z.uuid(),
});

export const ConstructionContractsMeasurementProjectQueryModel = z.object({
  projectId: z.uuid(),
});

export const ListConstructionContractsMeasurementsRequestModel = z
  .object({
    projectId: z.uuid(),
    side: z.enum(SIDES).optional(),
    workOrderId: z.uuid().optional(),
    status: z.enum(MEASUREMENT_STATUSES).optional(),
    from: z.iso.date().optional().describe("Measured on or after."),
    to: z.iso.date().optional().describe("Measured on or before."),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    after: z.string().min(1).max(500).optional(),
    before: z.string().min(1).max(500).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export const ListConstructionContractsMeasurementQuantitiesRequestModel =
  z.object({
    projectId: z.uuid(),
    side: z.enum(SIDES),
    workOrderId: z
      .uuid()
      .optional()
      .describe(
        "Required on the contractor side (400 MEASUREMENT_WORK_ORDER_REQUIRED); not sent on the client side.",
      ),
  });

/** Where on the Project a row was measured (CM-403 `LocationRef`). */
export const ConstructionContractsMeasurementLocationInputModel = z.object({
  type: locationType,
  wingId: z.uuid().nullable().optional(),
  floorIds: z.array(z.uuid()).max(200).optional(),
  unitIds: z.array(z.uuid()).max(5000).optional(),
  developmentId: z.uuid().nullable().optional(),
  locationId: z.uuid().nullable().optional(),
});

/** The stored LocationRef. */
export const ConstructionContractsMeasurementLocationModel = z.union([
  z.object({
    type: z.literal("wing"),
    wingId: z.uuid(),
    floorIds: z.array(z.uuid()),
    unitIds: z.array(z.uuid()),
  }),
  z.object({
    type: z.enum(["amenity", "common_development"]),
    developmentId: z.uuid(),
  }),
  z.object({ type: z.literal("location"), locationId: z.uuid() }),
]);

export const ConstructionContractsMeasurementRowInputModel = z.object({
  boqItemId: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "Client side: a live BOQ item of the Project (400 MEASUREMENT_ITEM_INVALID otherwise, and on the contractor side).",
    ),
  workOrderLineId: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "Contractor side: a live line of the sheet's Work Order (400 MEASUREMENT_ITEM_INVALID otherwise, and on the client side).",
    ),
  description: z
    .string()
    .max(5000)
    .nullable()
    .optional()
    .describe(
      `What was measured (Footing F1), at most ${String(MEASUREMENT_ROW_DESCRIPTION_MAX)} characters.`,
    ),
  location: ConstructionContractsMeasurementLocationInputModel.nullable()
    .optional()
    .describe("Checked against the Project's structure."),
  nos: decimalInput
    .nullable()
    .optional()
    .describe(
      "Blank is 1. Not 0; negative for a deduction (an opening). Four decimals.",
    ),
  length: decimalInput
    .nullable()
    .optional()
    .describe("More than 0, four decimals; blank leaves it out."),
  breadth: decimalInput
    .nullable()
    .optional()
    .describe("More than 0, four decimals; blank leaves it out."),
  depth: decimalInput
    .nullable()
    .optional()
    .describe(
      "Depth or height: more than 0, four decimals; blank leaves it out.",
    ),
  direct: z
    .boolean()
    .optional()
    .describe(
      "The quantity is typed in `quantity` instead of worked out; nos and the dimensions are dropped.",
    ),
  quantity: decimalInput
    .nullable()
    .optional()
    .describe(
      "Direct rows only: not 0, negative for a deduction, four decimals. Otherwise nos × the filled dimensions, rounded half up to four decimals.",
    ),
});

const content = {
  measuredOn: z
    .string()
    .describe(
      "`YYYY-MM-DD`, not in the future (400 MEASURED_ON_IN_FUTURE); the Back-dated Entry policy (module `measurement`) applies.",
    ),
  title: z
    .string()
    .max(1000)
    .nullable()
    .optional()
    .describe(`At most ${String(MEASUREMENT_TITLE_MAX)} characters.`),
  remarks: z
    .string()
    .max(20_000)
    .nullable()
    .optional()
    .describe(
      `At most ${MEASUREMENT_REMARKS_MAX.toLocaleString("en-IN")} characters; keeps its line breaks.`,
    ),
  rows: z
    .array(ConstructionContractsMeasurementRowInputModel)
    .max(MEASUREMENT_ROWS_MAX)
    .describe(
      `In order, at most ${String(MEASUREMENT_ROWS_MAX)}. A draft may have none; submitting needs one.`,
    ),
};

export const CreateConstructionContractsMeasurementRequestModel = z.object({
  projectId: z.uuid(),
  side: z
    .enum(SIDES)
    .describe(
      "client: measured against the BOQ; contractor: against one issued Work Order. Fixed once created.",
    ),
  workOrderId: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "Contractor side: an issued Work Order of the Project (400 MEASUREMENT_WORK_ORDER_INVALID). Not sent on the client side.",
    ),
  ...content,
});

export type CreateConstructionContractsMeasurementRequestModel = z.input<
  typeof CreateConstructionContractsMeasurementRequestModel
>;

export const UpdateConstructionContractsMeasurementRequestModel = z.object({
  ...content,
  expectedUpdatedAt: z.iso
    .datetime()
    .describe(
      "The sheet's `updatedAt` as loaded (409 MEASUREMENT_CHANGED when stale).",
    ),
});

export type UpdateConstructionContractsMeasurementRequestModel = z.input<
  typeof UpdateConstructionContractsMeasurementRequestModel
>;

export const ConstructionContractsMeasurementStepRequestModel = z.object({
  expectedUpdatedAt: optionalExpected,
});

export const CheckConstructionContractsMeasurementRequestModel = z.object({
  partyName: z
    .string()
    .max(1000)
    .describe(
      `The other party at the joint measurement, at most ${String(MEASUREMENT_PARTY_NAME_MAX)} characters (400 PARTY_NAME_REQUIRED).`,
    ),
  partyRole: z
    .string()
    .max(1000)
    .describe(
      `Their role, at most ${String(MEASUREMENT_PARTY_ROLE_MAX)} characters (400 PARTY_ROLE_REQUIRED).`,
    ),
  jointOn: z
    .string()
    .describe(
      "`YYYY-MM-DD`: on or after the date measured, not in the future (400 JOINT_ON_IN_FUTURE).",
    ),
  expectedUpdatedAt: optionalExpected,
});

export const ReturnConstructionContractsMeasurementRequestModel = z.object({
  reason: reason("RETURN_REASON_REQUIRED"),
  expectedUpdatedAt: optionalExpected,
});

export const ReopenConstructionContractsMeasurementRequestModel = z.object({
  reason: reason("REOPEN_REASON_REQUIRED"),
  expectedUpdatedAt: optionalExpected,
});

export const StartConstructionContractsMeasurementPhotoUploadRequestModel =
  z.object({
    fileName: z.string().min(1).max(255),
    bytes: z
      .int()
      .positive()
      .describe(
        `Size in bytes; 400 FILE_TOO_LARGE above ${String(MEASUREMENT_PHOTO_MAX_BYTES)}. 409 DOCUMENT_FILES_LIMIT at ${String(MEASUREMENT_PHOTOS_MAX)} photos; 402 past the plan's storage.`,
      ),
  });

export const StartConstructionContractsMeasurementPhotoUploadResponseModel =
  startUploadResponseModel();

export const AddConstructionContractsMeasurementPhotoRequestModel = z.object({
  key: z.string().describe("The `key` from step 1."),
  fileName: z.string().min(1).max(255),
});

export const PresignConstructionContractsMeasurementPhotoUploadRequestModel =
  presignUploadRequestModel();
export const PresignConstructionContractsMeasurementPhotoUploadResponseModel =
  presignUploadResponseModel();
export const ReceiveConstructionContractsMeasurementPhotoUploadQueryModel =
  UploadKeyQueryModel;
export const GetConstructionContractsMeasurementPhotoQueryModel =
  FileDownloadQueryModel;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

const summary = {
  id: z.uuid(),
  projectId: z.uuid(),
  side: z.enum(SIDES),
  workOrderId: z.uuid().nullable(),
  workOrderNumber: z.string().nullable(),
  partyLabel: z
    .string()
    .nullable()
    .describe(
      "The Project's Client (client side) or the Work Order's Contractor.",
    ),
  measuredOn: z.string(),
  title: z.string().nullable(),
  status: z.enum(MEASUREMENT_STATUSES),
  rowCount: z.int().nonnegative(),
  photoCount: z.int().nonnegative(),
  billed: z
    .boolean()
    .describe("A bill has taken a row: the sheet is read-only."),
  partyName: z.string().nullable(),
  partyRole: z.string().nullable(),
  jointOn: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso
    .datetime()
    .describe("Send it back as `expectedUpdatedAt` when you change it."),
};

export const ConstructionContractsMeasurementSummaryModel = z.object(summary);
export type ConstructionContractsMeasurementSummaryModel = z.infer<
  typeof ConstructionContractsMeasurementSummaryModel
>;

export const ListConstructionContractsMeasurementsResponseModel = z.object({
  items: z.array(ConstructionContractsMeasurementSummaryModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int().nonnegative(),
  viewerFlags: z
    .array(z.enum(FLAGS))
    .describe("The Measurement Book flags the caller holds on the Project."),
});
export type ListConstructionContractsMeasurementsResponseModel = z.infer<
  typeof ListConstructionContractsMeasurementsResponseModel
>;

export const ConstructionContractsMeasurementItemModel = z.object({
  id: z.uuid().describe("The BOQ item or Work Order line."),
  itemNo: z.string().nullable(),
  description: z.string(),
  uomName: z.string(),
  quantity: quantity(
    "The BOQ item's current quantity, or the Work Order line's.",
  ),
});
export type ConstructionContractsMeasurementItemModel = z.infer<
  typeof ConstructionContractsMeasurementItemModel
>;

export const ConstructionContractsMeasurementRowModel = z.object({
  id: z.uuid(),
  boqItemId: z.uuid().nullable(),
  workOrderLineId: z.uuid().nullable(),
  item: ConstructionContractsMeasurementItemModel.nullable().describe(
    "Null when the item is gone (a removed Work Order line).",
  ),
  description: z.string().nullable(),
  location: ConstructionContractsMeasurementLocationModel.nullable(),
  nos: z.string().nullable(),
  length: z.string().nullable(),
  breadth: z.string().nullable(),
  depth: z.string().nullable(),
  direct: z.boolean(),
  quantity: quantity("Negative for a deduction."),
  billId: z.uuid().nullable(),
  over: z
    .boolean()
    .describe(
      "Pushes its item over the planned quantity: a deviation (client) or over the Work Order (contractor).",
    ),
});
export type ConstructionContractsMeasurementRowModel = z.infer<
  typeof ConstructionContractsMeasurementRowModel
>;

export const ConstructionContractsMeasuredItemModel = z.object({
  itemId: z.uuid(),
  item: ConstructionContractsMeasurementItemModel.nullable(),
  planned: quantity("Current BOQ quantity or the line's quantity."),
  checked: quantity("On other live checked sheets."),
  thisSheet: quantity("This sheet's rows."),
  total: quantity("checked + thisSheet."),
  over: z.boolean(),
  overLimit: z
    .boolean()
    .describe(
      "Client side: beyond the Company's deviation limit; listed on the BOQ's Deviations tab once checked.",
    ),
  percentOver: z
    .string()
    .nullable()
    .describe("% over planned, two decimals; null when not over."),
});
export type ConstructionContractsMeasuredItemModel = z.infer<
  typeof ConstructionContractsMeasuredItemModel
>;

export const GetConstructionContractsMeasurementResponseModel = z.object({
  ...summary,
  remarks: z.string().nullable(),
  returnReason: z.string().nullable(),
  reopenReason: z.string().nullable(),
  submittedAt: z.iso.datetime().nullable(),
  submittedBy: z.string().nullable(),
  submittedByName: z.string().nullable(),
  checkedAt: z.iso.datetime().nullable(),
  checkedBy: z.string().nullable().describe("Our engineer: who checked it."),
  checkedByName: z.string().nullable(),
  createdBy: z.string(),
  createdByName: z.string().nullable(),
  projectName: z.string(),
  role: z.enum(["contract", "own"]),
  rows: z.array(ConstructionContractsMeasurementRowModel),
  items: z.array(ConstructionContractsMeasuredItemModel),
  deviationLimitPercent: z
    .string()
    .nullable()
    .describe("Client side: the Company's limit, two decimals."),
  warnings: z
    .array(z.object({ lineId: z.uuid(), message: z.string() }))
    .describe(
      "Contractor side: lines measured over the Work Order. Billing refuses the extra (409 WORK_ORDER_QUANTITY_EXCEEDED).",
    ),
  viewerFlags: z.array(z.enum(FLAGS)),
  allowed: z
    .object({
      edit: z.boolean(),
      delete: z.boolean(),
      submit: z.boolean(),
      check: z.boolean(),
      return: z.boolean(),
      reopen: z.boolean(),
      photos: z.boolean(),
    })
    .describe("What the caller may do now (flags, creator, status, bills)."),
});
export type GetConstructionContractsMeasurementResponseModel = z.infer<
  typeof GetConstructionContractsMeasurementResponseModel
>;

export const ConstructionContractsMeasurementFormOptionsResponseModel =
  z.object({
    role: z
      .enum(["contract", "own"])
      .describe(
        "On Own development the BOQ is a budget, never billed; measuring it is still allowed.",
      ),
    structure: z.enum(["wings", "locations"]),
    clientName: z.string().nullable(),
    boqItems: z.array(
      ConstructionContractsMeasurementItemModel.extend({
        sectionTitle: z.string(),
      }),
    ),
    workOrders: z
      .array(
        z.object({
          id: z.uuid(),
          number: z.string(),
          contractorName: z.string(),
          lines: z.array(ConstructionContractsMeasurementItemModel),
        }),
      )
      .describe("Issued Work Orders of the Project with their live lines."),
  });
export type ConstructionContractsMeasurementFormOptionsResponseModel = z.infer<
  typeof ConstructionContractsMeasurementFormOptionsResponseModel
>;

export const ListConstructionContractsMeasurementQuantitiesResponseModel =
  z.object({
    side: z.enum(SIDES),
    workOrderId: z.uuid().nullable(),
    deviationLimitPercent: z.string().nullable(),
    items: z.array(
      ConstructionContractsMeasurementItemModel.extend({
        checked: quantity("On live checked sheets."),
        pending: quantity("On submitted sheets, not yet checked."),
        over: z.boolean(),
        overLimit: z.boolean(),
        percentOver: z.string().nullable(),
      }),
    ),
  });
export type ListConstructionContractsMeasurementQuantitiesResponseModel =
  z.infer<typeof ListConstructionContractsMeasurementQuantitiesResponseModel>;

export const ConstructionContractsMeasurementPhotoModel = z.object({
  id: z.uuid(),
  fileName: z.string(),
  contentType: z.string(),
  bytes: z.int(),
  url: z
    .string()
    .describe(
      "Our route that streams the photo; add `?download=1` to save it.",
    ),
  thumbUrl: z.string().nullable(),
  createdAt: z.iso.datetime(),
  createdBy: z.string(),
  createdByName: z.string().nullable(),
  canRemove: z
    .boolean()
    .describe(
      "Update, or Create for the caller's own photo; never once billed.",
    ),
});
export type ConstructionContractsMeasurementPhotoModel = z.infer<
  typeof ConstructionContractsMeasurementPhotoModel
>;

export const ListConstructionContractsMeasurementPhotosResponseModel = z.object(
  {
    items: z
      .array(ConstructionContractsMeasurementPhotoModel)
      .describe("Live photos, oldest first. Never in the Project Gallery."),
    canUpload: z
      .boolean()
      .describe(
        "Create or Update on Measurement Book, while no bill has taken a row.",
      ),
  },
);
export type ListConstructionContractsMeasurementPhotosResponseModel = z.infer<
  typeof ListConstructionContractsMeasurementPhotosResponseModel
>;

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

const text = (value: bigint | null) =>
  value == null ? null : quantityText(value);
const percent = (value: bigint | null) =>
  value == null ? null : fixedDecimal(value, PERCENT_SCALE);

function itemOf(
  facts: MeasurementItemFacts,
): ConstructionContractsMeasurementItemModel {
  return {
    id: facts.id,
    itemNo: facts.itemNo,
    description: facts.description,
    uomName: facts.uomName,
    quantity: quantityText(facts.quantity),
  };
}

function item(
  facts: MeasurementItemFacts | null,
): ConstructionContractsMeasurementItemModel | null {
  return facts == null ? null : itemOf(facts);
}

export function toMeasurementSummaryResponse(
  sheet: MeasurementSheetView,
): ConstructionContractsMeasurementSummaryModel {
  return {
    id: sheet.id,
    projectId: sheet.projectId,
    side: sheet.side,
    workOrderId: sheet.workOrderId,
    workOrderNumber: sheet.workOrderNumber,
    partyLabel: sheet.partyLabel,
    measuredOn: sheet.measuredOn,
    title: sheet.title,
    status: sheet.status,
    rowCount: sheet.rowCount,
    photoCount: sheet.photoCount,
    billed: sheet.billed,
    partyName: sheet.partyName,
    partyRole: sheet.partyRole,
    jointOn: sheet.jointOn,
    createdAt: sheet.createdAt.toISOString(),
    updatedAt: sheet.updatedAt.toISOString(),
  };
}

export function toMeasurementResponse(
  detail: MeasurementDetail,
): GetConstructionContractsMeasurementResponseModel {
  const { sheet } = detail;
  return {
    ...toMeasurementSummaryResponse(sheet),
    remarks: sheet.remarks,
    returnReason: sheet.returnReason,
    reopenReason: sheet.reopenReason,
    submittedAt: sheet.submittedAt?.toISOString() ?? null,
    submittedBy: sheet.submittedBy,
    submittedByName: detail.submittedByName,
    checkedAt: sheet.checkedAt?.toISOString() ?? null,
    checkedBy: sheet.checkedBy,
    checkedByName: detail.checkedByName,
    createdBy: sheet.createdBy,
    createdByName: detail.createdByName,
    projectName: detail.projectName,
    role: detail.role,
    rows: detail.rows.map((row) => ({
      id: row.id,
      boqItemId: row.boqItemId,
      workOrderLineId: row.workOrderLineId,
      item: item(row.item),
      description: row.description,
      location: row.location as z.infer<
        typeof ConstructionContractsMeasurementLocationModel
      > | null,
      nos: text(row.nos),
      length: text(row.length),
      breadth: text(row.breadth),
      depth: text(row.depth),
      direct: row.direct,
      quantity: quantityText(row.quantity),
      billId: row.billId,
      over: row.over,
    })),
    items: detail.items.map((measured) => ({
      itemId: measured.itemId,
      item: item(measured.item),
      planned: quantityText(measured.planned),
      checked: quantityText(measured.checked),
      thisSheet: quantityText(measured.thisSheet),
      total: quantityText(measured.total),
      over: measured.over,
      overLimit: measured.overLimit,
      percentOver: percent(measured.percentOver),
    })),
    deviationLimitPercent: percent(detail.deviationLimit),
    warnings: detail.warnings,
    viewerFlags: detail.viewerFlags,
    allowed: detail.allowed,
  };
}

export function toMeasurementFormOptionsResponse(
  options: MeasurementFormOptions,
): ConstructionContractsMeasurementFormOptionsResponseModel {
  return {
    role: options.role,
    structure: options.structure,
    clientName: options.clientName,
    boqItems: options.boqItems.map((boqItem) => ({
      ...itemOf(boqItem),
      sectionTitle: boqItem.sectionTitle,
    })),
    workOrders: options.workOrders.map((order) => ({
      id: order.id,
      number: order.number,
      contractorName: order.contractorName,
      lines: order.lines.map((line) => itemOf(line)),
    })),
  };
}

export function toMeasurementQuantitiesResponse(
  quantities: MeasurementQuantities,
): ListConstructionContractsMeasurementQuantitiesResponseModel {
  return {
    side: quantities.side,
    workOrderId: quantities.workOrderId,
    deviationLimitPercent: percent(quantities.deviationLimit),
    items: quantities.items.map((measured) => ({
      ...itemOf(measured),
      checked: quantityText(measured.checked),
      pending: quantityText(measured.pending),
      over: measured.over,
      overLimit: measured.overLimit,
      percentOver: percent(measured.percentOver),
    })),
  };
}

/** `…/measurements/{id}/photos`. */
export function measurementPhotosPath(sheetId: string): string {
  return `${MEASUREMENTS_PATH}/${sheetId}/photos`;
}

export function toMeasurementPhotoResponse(
  photo: MeasurementPhotoView,
): ConstructionContractsMeasurementPhotoModel {
  const url = `${measurementPhotosPath(photo.sheetId)}/${photo.id}`;
  return {
    id: photo.id,
    fileName: photo.fileName,
    contentType: photo.contentType,
    bytes: photo.bytes,
    url,
    thumbUrl: photo.thumbKey == null ? null : `${url}/thumbnail`,
    createdAt: photo.createdAt.toISOString(),
    createdBy: photo.createdBy,
    createdByName: photo.createdByName,
    canRemove: photo.canRemove,
  };
}

/** A list position: the date measured and the id. */
export function encodeMeasurementCursor(cursor: MeasurementCursor): string {
  return Buffer.from(`${cursor.measuredOn}|${cursor.id}`, "utf8").toString(
    "base64url",
  );
}

export function decodeMeasurementCursor(raw: string): MeasurementCursor {
  const [measuredOn = "", id = ""] = Buffer.from(raw, "base64url")
    .toString("utf8")
    .split("|");
  if (!isCalendarDate(measuredOn) || !isUuid(id))
    throw new DomainError("INVALID_CURSOR", "The page cursor is not valid.");
  return { measuredOn, id };
}
