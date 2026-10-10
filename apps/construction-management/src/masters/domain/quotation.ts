import {
  MULTIPART_FROM_BYTES,
  type UploadPolicy,
} from "@/src/shared-kernel/attachments/upload-policy";

import type { PartyKind } from "./party";

const MB = 1024 * 1024;

/** A quotation file: a PDF or an image, at most 10 MB (CM-501). */
export const QUOTATION_MAX_BYTES = 10 * MB;

/** Quotations kept on one party; older ones can be removed. */
export const QUOTATIONS_PER_PARTY_MAX = 50;

/** `stored_files.kind` of a quotation. */
export const QUOTATION_FILE_KIND = "party_quotation";

/**
 * Keys live under `companies/<workspaceId>/quotations/<partyId>/…`, one
 * folder per Contractor or Supplier.
 */
export const QUOTATION_POLICY: UploadPolicy = {
  purpose: "quotations",
  accept: "pdf_or_image",
  maxBytes: QUOTATION_MAX_BYTES,
  multipartFromBytes: MULTIPART_FROM_BYTES,
};

/** A quotation file a Contractor or Supplier gave (`modules/02`, View Quotations). */
export type Quotation = {
  id: string;
  workspaceId: string;
  partyKind: PartyKind;
  partyId: string;
  fileKey: string;
  fileName: string;
  contentType: string;
  bytes: number;
  thumbKey: string | null;
  createdAt: Date;
  createdBy: string;
};
