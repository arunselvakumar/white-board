import { z } from "zod";

import type {
  BoqDeviation,
  BoqFormOptions,
  BoqItemView,
  BoqLibraryOption,
  BoqSectionView,
  BoqSettings,
  BoqView,
} from "@/src/contracts/application/boq-handlers";
import type { BoqImportResult } from "@/src/contracts/application/boq-import";
import type { VariationCursor } from "@/src/contracts/application/boq-ports";
import type { VariationView } from "@/src/contracts/application/variation-handlers";
import {
  BOQ_ITEM_DESCRIPTION_MAX,
  BOQ_ITEM_NO_MAX,
  BOQ_SECTION_TITLE_MAX,
  quantityText,
} from "@/src/contracts/domain/boq";
import {
  fixedDecimal,
  PERCENT_SCALE,
} from "@/src/contracts/domain/item-analysis";
import {
  VARIATION_KINDS,
  VARIATION_STATUSES,
} from "@/src/contracts/domain/variation";
import { FLAGS } from "@/src/shared-kernel/access";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

export const BOQ_PATH = "/api/construction/contracts/boq";

const decimalInput = z.union([z.string().trim().max(30), z.number()]);
const direction = z.enum(["up", "down"]);

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/** The Project a BOQ read is for. */
export const ConstructionContractsBoqProjectQueryModel = z.object({
  projectId: z.uuid(),
});

export const ConstructionContractsBoqParamsModel = z.object({ id: z.uuid() });

export const ListConstructionContractsBoqLibraryItemsRequestModel = z.object({
  projectId: z.uuid(),
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .describe("Part of the code, short description or description."),
});

export const CreateConstructionContractsBoqSectionRequestModel = z.object({
  projectId: z.uuid(),
  title: z
    .string()
    .max(1000)
    .describe(
      `Required, at most ${String(BOQ_SECTION_TITLE_MAX)} characters; unique in the Project's BOQ ignoring case (409 BOQ_SECTION_TITLE_TAKEN).`,
    ),
});
export type CreateConstructionContractsBoqSectionRequestModel = z.input<
  typeof CreateConstructionContractsBoqSectionRequestModel
>;

export const UpdateConstructionContractsBoqSectionRequestModel = z.object({
  title: CreateConstructionContractsBoqSectionRequestModel.shape.title,
  expectedUpdatedAt: z.iso
    .datetime()
    .describe("The section's `updatedAt` as loaded (409 BOQ_SECTION_CHANGED)."),
});

export const MoveConstructionContractsBoqRequestModel = z.object({
  direction: direction.describe("One place up or down; nothing at either end."),
});

export const DeleteConstructionContractsBoqRequestModel = z.object({
  expectedUpdatedAt: z.iso
    .datetime()
    .optional()
    .describe("When sent, a stale one is refused with 409 *_CHANGED."),
});

const itemFields = {
  sectionId: z
    .uuid()
    .describe(
      "A live section of the Project (404 BOQ_SECTION_NOT_FOUND). On an update, another section moves the item to its end.",
    ),
  libraryItemId: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "Create only: the Item Library Item the form was filled from (400 BOQ_LIBRARY_ITEM_NOT_FOUND once deleted). It is locked while the item is added, so it cannot be deleted in between.",
    ),
  itemNo: z
    .string()
    .max(1000)
    .describe(
      `As the contract prints it ("2.1.3"); required, at most ${String(BOQ_ITEM_NO_MAX)} characters; unique in the Project ignoring case (409 BOQ_ITEM_NO_TAKEN).`,
    ),
  description: z
    .string()
    .max(40_000)
    .describe(
      `Required, at most ${BOQ_ITEM_DESCRIPTION_MAX.toLocaleString("en-IN")} characters.`,
    ),
  uomId: z
    .uuid()
    .describe("A live, enabled UoM of the Company (400 BOQ_ITEM_UOM_INVALID)."),
  sacHsn: z
    .string()
    .max(30)
    .nullable()
    .optional()
    .describe("SAC or HSN: 4 to 8 digits (400 SAC_HSN_INVALID)."),
  quantity: decimalInput.describe(
    'More than 0, at most four decimals ("12.5"; 400 BOQ_QUANTITY_INVALID). Refused once measured when it changes (409 BOQ_ITEM_MEASURED).',
  ),
  rate: z
    .int()
    .nullable()
    .optional()
    .describe(
      "Paise per UoM, 0 to ₹1,000 crore (400 BOQ_RATE_INVALID). Required with BOQ Financial; ignored without it (a copied item takes the library's adopted rate, a typed one ₹0, an edit keeps the rate).",
    ),
  wingId: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "A Wing of the Project, when it is a building (400 BOQ_ITEM_WING_INVALID).",
    ),
  locationId: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "A Location of the Project, when it has Locations (400 BOQ_ITEM_LOCATION_INVALID).",
    ),
};

export const CreateConstructionContractsBoqItemRequestModel = z.object({
  projectId: z.uuid(),
  ...itemFields,
});
export type CreateConstructionContractsBoqItemRequestModel = z.input<
  typeof CreateConstructionContractsBoqItemRequestModel
>;

export const UpdateConstructionContractsBoqItemRequestModel = z.object({
  ...itemFields,
  libraryItemId: z.null().optional().describe("Ignored on an update."),
  expectedUpdatedAt: z.iso
    .datetime()
    .describe("The item's `updatedAt` as loaded (409 BOQ_ITEM_CHANGED)."),
});
export type UpdateConstructionContractsBoqItemRequestModel = z.input<
  typeof UpdateConstructionContractsBoqItemRequestModel
>;

const variationFields = {
  reason: z
    .string()
    .max(5000)
    .describe(
      "Required, at most 500 characters (400 VARIATION_REASON_REQUIRED).",
    ),
  boqItemId: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "Quantity and rate changes: a live item of the Project (404 BOQ_ITEM_NOT_FOUND) with no other pending change (409 VARIATION_PENDING).",
    ),
  sectionId: z
    .uuid()
    .nullable()
    .optional()
    .describe("Extra item: the section it joins (404 BOQ_SECTION_NOT_FOUND)."),
  itemNo: z
    .string()
    .max(1000)
    .nullable()
    .optional()
    .describe("Extra item: its number (409 BOQ_ITEM_NO_TAKEN)."),
  description: z.string().max(40_000).nullable().optional(),
  uomId: z.uuid().nullable().optional(),
  sacHsn: z.string().max(30).nullable().optional(),
  newQuantity: decimalInput
    .nullable()
    .optional()
    .describe("Extra item and quantity change: more than 0, four decimals."),
  newRate: z
    .int()
    .nullable()
    .optional()
    .describe(
      "Extra item and rate change: paise per UoM. These kinds need BOQ Financial (403).",
    ),
};

export const CreateConstructionContractsVariationRequestModel = z.object({
  projectId: z.uuid(),
  kind: z.enum(VARIATION_KINDS),
  ...variationFields,
});
export type CreateConstructionContractsVariationRequestModel = z.input<
  typeof CreateConstructionContractsVariationRequestModel
>;

export const UpdateConstructionContractsVariationRequestModel = z.object({
  ...variationFields,
  expectedUpdatedAt: z.iso
    .datetime()
    .describe("The Variation's `updatedAt` as loaded (409 VARIATION_CHANGED)."),
});
export type UpdateConstructionContractsVariationRequestModel = z.input<
  typeof UpdateConstructionContractsVariationRequestModel
>;

export const RejectConstructionContractsVariationRequestModel = z.object({
  reason: z
    .string()
    .max(5000)
    .describe(
      "Required, at most 500 characters (400 REJECTION_REASON_REQUIRED).",
    ),
});

export const ListConstructionContractsVariationsRequestModel = z
  .object({
    projectId: z.uuid(),
    status: z.enum(VARIATION_STATUSES).optional(),
    boqItemId: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    after: z.string().min(1).max(500).optional(),
    before: z.string().min(1).max(500).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export const UpdateConstructionContractsBoqSettingsRequestModel = z.object({
  deviationLimitPercent: decimalInput.describe(
    "0 to 100, at most two decimals (400 DEVIATION_LIMIT_INVALID).",
  ),
});

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

const money = (description: string) =>
  z.int().nullable().describe(`${description} Null without BOQ Financial.`);

const quantity = (description: string) =>
  z.string().describe(`${description} Four places ("12.5000").`);

export const ConstructionContractsBoqItemModel = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  sectionId: z.uuid(),
  libraryItemId: z.uuid().nullable(),
  libraryCode: z.string().nullable(),
  itemNo: z.string(),
  description: z.string(),
  uomId: z.uuid(),
  uomName: z.string(),
  sacHsn: z.string().nullable(),
  originalQuantity: quantity("What the contract said."),
  quantity: quantity("Current: after approved Variations."),
  originalRate: money("Paise per UoM: what the contract said."),
  rate: money("Paise per UoM, current."),
  amount: money("Paise: round(quantity × rate), half up."),
  wingId: z.uuid().nullable(),
  locationId: z.uuid().nullable(),
  placeName: z.string().nullable().describe("The Wing's or Location's name."),
  position: z.int().nonnegative(),
  variationId: z
    .uuid()
    .nullable()
    .describe("The Variation that added it (an extra item)."),
  measured: z
    .boolean()
    .describe(
      "A checked measurement names it: quantity and rate change only through a Variation, and it cannot be deleted.",
    ),
  measuredQuantity: z
    .string()
    .nullable()
    .describe("What checked measurements add up to; null when none."),
  pendingVariation: z
    .object({
      id: z.uuid(),
      number: z.string(),
      kind: z.enum(VARIATION_KINDS),
    })
    .nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso
    .datetime()
    .describe("Send it back as `expectedUpdatedAt` when you edit."),
});
export type ConstructionContractsBoqItemModel = z.infer<
  typeof ConstructionContractsBoqItemModel
>;

export const ConstructionContractsBoqSectionModel = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  title: z.string(),
  position: z.int().nonnegative(),
  subtotal: money("Paise: the section's item amounts."),
  items: z.array(ConstructionContractsBoqItemModel),
  updatedAt: z.iso.datetime(),
});
export type ConstructionContractsBoqSectionModel = z.infer<
  typeof ConstructionContractsBoqSectionModel
>;

/** A section after a create or a rename. */
export const ConstructionContractsBoqSectionResponseModel = z.object({
  id: z.uuid(),
  title: z.string(),
  position: z.int().nonnegative(),
  updatedAt: z.iso.datetime(),
});
export type ConstructionContractsBoqSectionResponseModel = z.infer<
  typeof ConstructionContractsBoqSectionResponseModel
>;

export function toSectionSummaryResponse(section: {
  id: string;
  title: string;
  position: number;
  updatedAt: Date;
}): ConstructionContractsBoqSectionResponseModel {
  return {
    id: section.id,
    title: section.title,
    position: section.position,
    updatedAt: section.updatedAt.toISOString(),
  };
}

export const GetConstructionContractsBoqResponseModel = z
  .object({
    projectId: z.uuid(),
    role: z.enum(["contract", "own"]),
    structure: z.enum(["wings", "locations"]),
    financial: z
      .boolean()
      .describe("The caller holds BOQ Financial: rates and amounts are sent."),
    viewerFlags: z.array(z.enum(FLAGS)),
    deviationLimitPercent: z.string().describe('Two places ("25.00").'),
    itemCount: z.int().nonnegative(),
    total: money("Paise: the BOQ total."),
    orderValue: money("Paise: the Project's Order Value excluding GST."),
    difference: money("Paise: total − Order Value; null without one."),
    sections: z.array(ConstructionContractsBoqSectionModel),
  })
  .meta({
    description:
      "A Project's BOQ: sections in order with their items, subtotals and the total beside the Order Value (CM-1103).",
  });
export type GetConstructionContractsBoqResponseModel = z.infer<
  typeof GetConstructionContractsBoqResponseModel
>;

export const ConstructionContractsVariationModel = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  number: z.string(),
  kind: z.enum(VARIATION_KINDS),
  status: z.enum(VARIATION_STATUSES),
  boqItemId: z
    .uuid()
    .nullable()
    .describe("The item changed; an extra item's once approved."),
  boqItemNo: z.string().nullable(),
  boqItemDescription: z.string().nullable(),
  sectionId: z.uuid().nullable(),
  sectionTitle: z.string().nullable(),
  itemNo: z.string().nullable(),
  description: z.string().nullable(),
  uomId: z.uuid().nullable(),
  uomName: z.string().nullable(),
  sacHsn: z.string().nullable(),
  previousQuantity: z.string().nullable(),
  newQuantity: z.string().nullable(),
  previousRate: money("Paise per UoM the change replaced."),
  newRate: money("Paise per UoM."),
  reason: z.string(),
  rejectReason: z.string().nullable(),
  decidedAt: z.iso.datetime().nullable(),
  decidedBy: z.string().nullable(),
  decidedByName: z.string().nullable(),
  createdBy: z.string(),
  createdByName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ConstructionContractsVariationModel = z.infer<
  typeof ConstructionContractsVariationModel
>;

export const GetConstructionContractsBoqItemResponseModel = z.object({
  item: ConstructionContractsBoqItemModel,
  variations: z.array(ConstructionContractsVariationModel),
});
export type GetConstructionContractsBoqItemResponseModel = z.infer<
  typeof GetConstructionContractsBoqItemResponseModel
>;

export const ListConstructionContractsVariationsResponseModel = z.object({
  items: z.array(ConstructionContractsVariationModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int().nonnegative(),
  financial: z.boolean(),
});
export type ListConstructionContractsVariationsResponseModel = z.infer<
  typeof ListConstructionContractsVariationsResponseModel
>;

export const ConstructionContractsBoqFormOptionsResponseModel = z.object({
  structure: z.enum(["wings", "locations"]),
  uoms: z.array(z.object({ id: z.uuid(), name: z.string() })),
  wings: z.array(
    z.object({ id: z.uuid(), name: z.string(), phaseName: z.string() }),
  ),
  locations: z.array(z.object({ id: z.uuid(), name: z.string() })),
  sections: z.array(z.object({ id: z.uuid(), title: z.string() })),
});
export type ConstructionContractsBoqFormOptionsResponseModel = z.infer<
  typeof ConstructionContractsBoqFormOptionsResponseModel
>;

export const ConstructionContractsBoqLibraryItemModel = z.object({
  id: z.uuid(),
  code: z.string(),
  shortDescription: z.string(),
  description: z.string().nullable(),
  uomId: z.uuid(),
  uomName: z.string(),
  sacHsn: z.string().nullable(),
  adoptedRate: money("Paise per UoM: the suggested rate."),
});
export type ConstructionContractsBoqLibraryItemModel = z.infer<
  typeof ConstructionContractsBoqLibraryItemModel
>;

export const ListConstructionContractsBoqLibraryItemsResponseModel = z.object({
  items: z.array(ConstructionContractsBoqLibraryItemModel),
});
export type ListConstructionContractsBoqLibraryItemsResponseModel = z.infer<
  typeof ListConstructionContractsBoqLibraryItemsResponseModel
>;

export const ConstructionContractsBoqDeviationModel = z.object({
  boqItemId: z.uuid(),
  sectionTitle: z.string(),
  itemNo: z.string(),
  description: z.string(),
  uomName: z.string(),
  quantity: quantity("Current."),
  measuredQuantity: quantity("Checked measurements."),
  percentOver: z
    .string()
    .nullable()
    .describe('How far measured is over current, two places ("30.00").'),
  rate: money("Paise per UoM, for a prefilled rate change."),
  pendingVariation: ConstructionContractsBoqItemModel.shape.pendingVariation,
});

export const ListConstructionContractsBoqDeviationsResponseModel = z.object({
  deviationLimitPercent: z.string(),
  items: z.array(ConstructionContractsBoqDeviationModel),
});
export type ListConstructionContractsBoqDeviationsResponseModel = z.infer<
  typeof ListConstructionContractsBoqDeviationsResponseModel
>;

export const ConstructionContractsBoqSettingsResponseModel = z.object({
  deviationLimitPercent: z.string().describe('Two places ("25.00").'),
  updatedAt: z.iso.datetime().nullable(),
  canUpdate: z
    .boolean()
    .describe(
      "The caller holds BOQ Update (on any Project) and may change it.",
    ),
});
export type ConstructionContractsBoqSettingsResponseModel = z.infer<
  typeof ConstructionContractsBoqSettingsResponseModel
>;

export const ImportConstructionContractsBoqResponseModel = z.object({
  sectionsCreated: z.int().nonnegative(),
  created: z.int().nonnegative(),
  updated: z.int().nonnegative(),
  unchanged: z
    .int()
    .nonnegative()
    .describe("Rows whose item already had exactly these fields."),
});
export type ImportConstructionContractsBoqResponseModel = z.infer<
  typeof ImportConstructionContractsBoqResponseModel
>;

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

const paise = (value: bigint, financial: boolean): number | null =>
  financial ? Number(value) : null;

const percent = (value: bigint) => fixedDecimal(value, PERCENT_SCALE);

export function toBoqItemResponse(
  item: BoqItemView,
  financial: boolean,
): ConstructionContractsBoqItemModel {
  return {
    id: item.id,
    projectId: item.projectId,
    sectionId: item.sectionId,
    libraryItemId: item.itemId,
    libraryCode: item.libraryCode,
    itemNo: item.itemNo,
    description: item.description,
    uomId: item.uomId,
    uomName: item.uomName,
    sacHsn: item.sacHsn,
    originalQuantity: quantityText(item.originalQuantity),
    quantity: quantityText(item.quantity),
    originalRate: paise(item.originalRate, financial),
    rate: paise(item.rate, financial),
    amount: paise(item.amount, financial),
    wingId: item.wingId,
    locationId: item.locationId,
    placeName: item.placeName,
    position: item.position,
    variationId: item.variationId,
    measured: item.measured,
    measuredQuantity:
      item.measuredQuantity == null
        ? null
        : quantityText(item.measuredQuantity),
    pendingVariation: item.pendingVariation,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function toSectionResponse(
  section: BoqSectionView,
  financial: boolean,
): ConstructionContractsBoqSectionModel {
  return {
    id: section.id,
    projectId: section.projectId,
    title: section.title,
    position: section.position,
    subtotal: paise(section.subtotal, financial),
    items: section.items.map((item) => toBoqItemResponse(item, financial)),
    updatedAt: section.updatedAt.toISOString(),
  };
}

export function toBoqResponse(
  view: BoqView,
): GetConstructionContractsBoqResponseModel {
  const { financial } = view;
  return {
    projectId: view.project.id,
    role: view.project.role,
    structure: view.project.structure,
    financial,
    viewerFlags: view.viewerFlags,
    deviationLimitPercent: percent(view.deviationLimit),
    itemCount: view.sections.reduce(
      (sum, section) => sum + section.items.length,
      0,
    ),
    total: paise(view.total, financial),
    orderValue:
      view.orderValue == null ? null : paise(view.orderValue, financial),
    difference:
      view.difference == null ? null : paise(view.difference, financial),
    sections: view.sections.map((section) =>
      toSectionResponse(section, financial),
    ),
  };
}

export function toVariationResponse(
  variation: VariationView,
  financial: boolean,
): ConstructionContractsVariationModel {
  const money = (value: bigint | null) =>
    value == null ? null : paise(value, financial);
  return {
    id: variation.id,
    projectId: variation.projectId,
    number: variation.number,
    kind: variation.kind,
    status: variation.status,
    boqItemId: variation.boqItemId,
    boqItemNo: variation.boqItemNo,
    boqItemDescription: variation.boqItemDescription,
    sectionId: variation.sectionId,
    sectionTitle: variation.sectionTitle,
    itemNo: variation.itemNo,
    description: variation.description,
    uomId: variation.uomId,
    uomName: variation.uomName,
    sacHsn: variation.sacHsn,
    previousQuantity:
      variation.previousQuantity == null
        ? null
        : quantityText(variation.previousQuantity),
    newQuantity:
      variation.newQuantity == null
        ? null
        : quantityText(variation.newQuantity),
    previousRate: money(variation.previousRate),
    newRate: money(variation.newRate),
    reason: variation.reason,
    rejectReason: variation.rejectReason,
    decidedAt: variation.decidedAt?.toISOString() ?? null,
    decidedBy: variation.decidedBy,
    decidedByName: variation.decidedByName,
    createdBy: variation.createdBy,
    createdByName: variation.createdByName,
    createdAt: variation.createdAt.toISOString(),
    updatedAt: variation.updatedAt.toISOString(),
  };
}

export function toFormOptionsResponse(
  options: BoqFormOptions,
): ConstructionContractsBoqFormOptionsResponseModel {
  return {
    structure: options.structure,
    uoms: options.uoms.map(({ id, name }) => ({ id, name })),
    wings: options.wings.map(({ id, name, phaseName }) => ({
      id,
      name,
      phaseName,
    })),
    locations: options.locations.map(({ id, name }) => ({ id, name })),
    sections: options.sections,
  };
}

export function toLibraryItemResponse(
  option: BoqLibraryOption,
  financial: boolean,
): ConstructionContractsBoqLibraryItemModel {
  return {
    id: option.id,
    code: option.code,
    shortDescription: option.shortDescription,
    description: option.description,
    uomId: option.uomId,
    uomName: option.uomName,
    sacHsn: option.sacHsn,
    adoptedRate: paise(option.adoptedRate, financial),
  };
}

export function toDeviationsResponse(found: {
  limit: bigint;
  financial: boolean;
  items: BoqDeviation[];
}): ListConstructionContractsBoqDeviationsResponseModel {
  return {
    deviationLimitPercent: percent(found.limit),
    items: found.items.map((row) => ({
      boqItemId: row.item.id,
      sectionTitle: row.sectionTitle,
      itemNo: row.item.itemNo,
      description: row.item.description,
      uomName: row.item.uomName,
      quantity: quantityText(row.item.quantity),
      measuredQuantity: quantityText(row.measuredQuantity),
      percentOver: row.percentOver == null ? null : percent(row.percentOver),
      rate: paise(row.item.rate, found.financial),
      pendingVariation: row.item.pendingVariation,
    })),
  };
}

export function toSettingsResponse(
  settings: BoqSettings,
): ConstructionContractsBoqSettingsResponseModel {
  return {
    deviationLimitPercent: percent(settings.deviationLimit),
    updatedAt: settings.updatedAt?.toISOString() ?? null,
    canUpdate: settings.canUpdate,
  };
}

export function toImportResponse(
  result: BoqImportResult,
): ImportConstructionContractsBoqResponseModel {
  return result;
}

export const encodeVariationCursor = (cursor: VariationCursor): string =>
  encodeListCursor(cursor);
export const decodeVariationCursor = (raw: string): VariationCursor =>
  decodeListCursor(raw);
