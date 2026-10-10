import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionMastersQuotationResponseModel,
  ListConstructionMastersPartyQuotationsResponseModel,
  ListConstructionMastersQuotationsResponseModel,
} from "@/app/api/construction/masters/_lib/quotation-models";
import { QUOTATION_POLICY } from "@/src/masters/domain/quotation";
import { DomainError } from "@/src/shared-kernel/domain-error";
import {
  assertNameAccepted,
  assertSizeAccepted,
} from "@/src/shared-kernel/attachments/upload-policy";

import { directUpload, postJson, type UploadOptions } from "./direct-upload";
import { apiJson, QueryHttpError } from "./http";
import type { PartyList } from "./parties";

/** A Contractor's or Supplier's quotation file (CM-501). */
export type Quotation = ConstructionMastersQuotationResponseModel;
export type PartyQuotationList =
  ListConstructionMastersPartyQuotationsResponseModel;
export type QuotationPage = ListConstructionMastersQuotationsResponseModel;

const BASE = "/api/construction/masters";

/** Every quotation key starts here: a party's list and View Quotations. */
export const QUOTATIONS_KEY = ["masters", "quotations"] as const;

/** The picker for a quotation upload. */
export const QUOTATION_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp";

/** `…/{contractors|suppliers}/{id}/quotations`. */
export function partyQuotationsPath(list: PartyList, partyId: string): string {
  return `${BASE}/${list}/${encodeURIComponent(partyId)}/quotations`;
}

export function partyQuotationsKey(list: PartyList, partyId: string) {
  return [...QUOTATIONS_KEY, "party", list, partyId] as const;
}

/** One party's quotations, newest first. */
export function partyQuotationsQuery(list: PartyList, partyId: string) {
  return queryOptions({
    queryKey: partyQuotationsKey(list, partyId),
    queryFn: () =>
      apiJson<PartyQuotationList>(partyQuotationsPath(list, partyId)),
  });
}

export type QuotationsFilter = {
  search: string;
  partyKind: "all" | "contractor" | "supplier";
  cursor: { after: string } | { before: string } | null;
};

/** View Quotations: every party's files, newest first, in pages. */
export function quotationsQuery(filter: QuotationsFilter) {
  const params = new URLSearchParams({ limit: "25" });
  if (filter.search.trim().length > 0) params.set("q", filter.search.trim());
  if (filter.partyKind !== "all") params.set("partyKind", filter.partyKind);
  if (filter.cursor != null) {
    if ("after" in filter.cursor) params.set("after", filter.cursor.after);
    else params.set("before", filter.cursor.before);
  }
  return queryOptions({
    queryKey: [...QUOTATIONS_KEY, "list", params.toString()],
    queryFn: () =>
      apiJson<QuotationPage>(`${BASE}/quotations?${params.toString()}`),
  });
}

/**
 * Null when the file may go up; else the server's own refusal (a PDF or
 * an image, at most 10 MB), checked in the browser first.
 */
export function checkQuotationFile(file: {
  name: string;
  size: number;
}): { code: string; message: string } | null {
  try {
    assertNameAccepted(QUOTATION_POLICY, file.name);
    assertSizeAccepted(QUOTATION_POLICY, file.size);
    return null;
  } catch (error) {
    if (error instanceof DomainError)
      return { code: error.code, message: error.message };
    throw error;
  }
}

/**
 * Keeps one quotation on the party through `directUpload`: start (the
 * server checks name, size, the 50-file limit and the plan), the bytes,
 * an image's thumbnail, then complete. A wrong type or a file over 10 MB
 * fails here without a request.
 */
export async function uploadPartyQuotation(
  list: PartyList,
  partyId: string,
  file: File,
  options: UploadOptions = {},
): Promise<Quotation> {
  const problem = checkQuotationFile(file);
  if (problem != null) throw new QueryHttpError(400, problem);
  const base = partyQuotationsPath(list, partyId);
  return directUpload({
    startUrl: `${base}/uploads`,
    file,
    options,
    complete: (started, signal) =>
      postJson<Quotation>(
        base,
        { key: started.key, fileName: started.fileName },
        signal,
      ),
  });
}

export type UploadQuotationInput = { file: File } & UploadOptions;

export function useUploadPartyQuotation(list: PartyList, partyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, ...options }: UploadQuotationInput) =>
      uploadPartyQuotation(list, partyId, file, options),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: QUOTATIONS_KEY }),
  });
}

/** Removes a quotation; a 404 (gone already) refreshes the list too. */
export function useDeletePartyQuotation(list: PartyList, partyId: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: QUOTATIONS_KEY });
  return useMutation({
    mutationFn: (quotationId: string) =>
      postJson<undefined>(
        `${partyQuotationsPath(list, partyId)}/${encodeURIComponent(quotationId)}/delete`,
        {},
      ),
    onSuccess: refresh,
    onError: (error) =>
      error instanceof QueryHttpError && error.status === 404
        ? refresh()
        : undefined,
  });
}
