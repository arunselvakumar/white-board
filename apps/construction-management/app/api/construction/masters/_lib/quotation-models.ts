import { z } from "zod";

import { startUploadResponseModel } from "@/app/api/_lib/attachments";
import type { QuotationView } from "@/src/masters/application/party-quotations";
import { QUOTATION_MAX_BYTES } from "@/src/masters/domain/quotation";
import { PARTY_KINDS, type PartyKind } from "@/src/masters/domain/party";

/** `{id}/quotations/{quotationId}` on a Contractor or Supplier. */
export const ConstructionMastersQuotationParamsModel = z.object({
  id: z.uuid(),
  quotationId: z.uuid(),
});

export const ConstructionMastersQuotationResponseModel = z.object({
  id: z.uuid(),
  partyKind: z.enum(PARTY_KINDS),
  partyId: z.uuid(),
  partyName: z.string(),
  fileName: z.string(),
  contentType: z
    .string()
    .describe("application/pdf, image/png, image/jpeg or image/webp."),
  bytes: z.int(),
  viewable: z.boolean(),
  url: z
    .string()
    .describe("Our route that streams the file; add `?download=1` to save it."),
  thumbUrl: z.string().nullable(),
  createdAt: z.iso.datetime(),
  createdBy: z.string().describe("User id of the uploader."),
  createdByName: z.string().nullable(),
});
export type ConstructionMastersQuotationResponseModel = z.infer<
  typeof ConstructionMastersQuotationResponseModel
>;

export const ListConstructionMastersPartyQuotationsResponseModel = z.object({
  items: z
    .array(ConstructionMastersQuotationResponseModel)
    .describe("Newest first."),
});
export type ListConstructionMastersPartyQuotationsResponseModel = z.infer<
  typeof ListConstructionMastersPartyQuotationsResponseModel
>;

/** View Quotations: every live party's quotations, newest first. */
export const ListConstructionMastersQuotationsQueryModel = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
    q: z
      .string()
      .trim()
      .max(120)
      .optional()
      .describe("Party name or file name contains, ignoring case."),
    partyKind: z.enum(PARTY_KINDS).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export const ListConstructionMastersQuotationsResponseModel = z.object({
  items: z.array(ConstructionMastersQuotationResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int().nonnegative(),
});
export type ListConstructionMastersQuotationsResponseModel = z.infer<
  typeof ListConstructionMastersQuotationsResponseModel
>;

/** Step 1 of a quotation upload: say what is coming. */
export const StartConstructionMastersQuotationUploadRequestModel = z.object({
  fileName: z
    .string()
    .min(1)
    .max(255)
    .describe("A PDF, PNG, JPEG or WebP (400 FILE_TYPE_NOT_ALLOWED)."),
  bytes: z
    .int()
    .positive()
    .describe(
      `Size in bytes; 400 FILE_TOO_LARGE above ${String(QUOTATION_MAX_BYTES)}. 409 QUOTATIONS_LIMIT at 50 files; 402 past the plan's storage.`,
    ),
});

export const StartConstructionMastersQuotationUploadResponseModel =
  startUploadResponseModel();

/** Step 3: the bytes are in storage; record the quotation. */
export const AddConstructionMastersQuotationRequestModel = z.object({
  key: z.string().describe("The `key` from step 1."),
  fileName: z.string().min(1).max(255),
});

export function partyPath(kind: PartyKind): string {
  return `/api/construction/masters/${kind === "contractor" ? "contractors" : "suppliers"}`;
}

/** `…/{suppliers|contractors}/{id}/quotations`: every URL of a party's files. */
export function quotationsPath(kind: PartyKind, partyId: string): string {
  return `${partyPath(kind)}/${partyId}/quotations`;
}

export function toQuotationResponse(
  item: QuotationView,
): ConstructionMastersQuotationResponseModel {
  const base = `${quotationsPath(item.partyKind, item.partyId)}/${item.id}`;
  return {
    id: item.id,
    partyKind: item.partyKind,
    partyId: item.partyId,
    partyName: item.partyName,
    fileName: item.fileName,
    contentType: item.contentType,
    bytes: item.bytes,
    viewable: item.viewable,
    url: base,
    thumbUrl: item.thumbKey == null ? null : `${base}/thumbnail`,
    createdAt: item.createdAt.toISOString(),
    createdBy: item.createdBy,
    createdByName: item.createdByName,
  };
}
