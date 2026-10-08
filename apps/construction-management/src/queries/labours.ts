import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type { ConstructionLabourPartyDocumentResponseModel } from "@/app/api/construction/labour/_party-files/party-file-models";
import type {
  ConstructionLabourLabourResponseModel,
  CreateConstructionLabourLabourRequestModel,
  ImportConstructionLabourLaboursResponseModel,
  ListConstructionLabourLabourTransfersResponseModel,
  ListConstructionLabourLaboursResponseModel,
  UpdateConstructionLabourLabourRequestModel,
} from "@/app/api/construction/labour/labours/labour-models";

import { QueryHttpError, apiJson } from "./http";

export type LabourResponse = ConstructionLabourLabourResponseModel;
export type LabourList = ListConstructionLabourLaboursResponseModel;
export type LabourInput = CreateConstructionLabourLabourRequestModel;
export type LabourUpdateInput = UpdateConstructionLabourLabourRequestModel;
export type LabourTransfer =
  ListConstructionLabourLabourTransfersResponseModel["items"][number];
export type LabourImportPreview = ImportConstructionLabourLaboursResponseModel;
export type LabourDocument = ConstructionLabourPartyDocumentResponseModel;

export const LABOURS_API = "/api/construction/labour/labours";

/** Every Labour query key starts here, so one invalidation covers them. */
export const LABOURS_KEY = ["labour", "labours"] as const;

export type LabourListFilter = {
  search: string;
  status: "all" | "active" | "inactive";
  projectId: string | null;
  supervisorId: string | null;
  categoryId: string | null;
  cursor: { after: string } | { before: string } | null;
};

/** The list filter as query parameters (also used by Export). */
export function labourFilterParams(
  filter: Omit<LabourListFilter, "cursor">,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.search.trim().length > 0) params.set("q", filter.search.trim());
  if (filter.status !== "all")
    params.set("active", filter.status === "active" ? "true" : "false");
  if (filter.projectId != null) params.set("projectId", filter.projectId);
  if (filter.supervisorId != null)
    params.set("supervisorId", filter.supervisorId);
  if (filter.categoryId != null) params.set("categoryId", filter.categoryId);
  return params;
}

export function laboursQuery(filter: LabourListFilter) {
  const params = labourFilterParams(filter);
  params.set("limit", "25");
  if (filter.cursor != null) {
    if ("after" in filter.cursor) params.set("after", filter.cursor.after);
    else params.set("before", filter.cursor.before);
  }
  return queryOptions({
    queryKey: [...LABOURS_KEY, "list", params.toString()],
    queryFn: () => apiJson<LabourList>(`${LABOURS_API}?${params.toString()}`),
  });
}

function itemUrl(id: string, path = ""): string {
  return `${LABOURS_API}/${encodeURIComponent(id)}${path}`;
}

export function labourQuery(id: string) {
  return queryOptions({
    queryKey: [...LABOURS_KEY, "detail", id],
    queryFn: () => apiJson<LabourResponse>(itemUrl(id)),
  });
}

export function labourTransfersQuery(id: string) {
  return queryOptions({
    queryKey: [...LABOURS_KEY, "transfers", id],
    queryFn: () =>
      apiJson<ListConstructionLabourLabourTransfersResponseModel>(
        itemUrl(id, "/transfers"),
      ),
  });
}

export function labourDocumentsQuery(id: string) {
  return queryOptions({
    queryKey: [...LABOURS_KEY, "documents", id],
    queryFn: () =>
      apiJson<{ items: LabourDocument[] }>(itemUrl(id, "/documents")),
  });
}

function postJson<T>(url: string, body?: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function postFile<T>(url: string, file: Blob, type?: string): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: {
      "content-type": type ?? (file.type || "application/octet-stream"),
    },
    body: file,
  });
}

export function createLabour(input: LabourInput): Promise<LabourResponse> {
  return postJson(LABOURS_API, input);
}

export function updateLabour(
  id: string,
  input: LabourUpdateInput,
): Promise<LabourResponse> {
  return postJson(itemUrl(id, "/update"), input);
}

export type LabourCommand =
  | { kind: "activate" | "deactivate" | "delete"; id: string }
  | {
      kind: "transfer";
      labourIds: string[];
      toProjectId: string;
      transferDate: string;
      remark: string | null;
    };

export function runLabourCommand(command: LabourCommand): Promise<unknown> {
  if (command.kind === "transfer")
    return postJson(`${LABOURS_API}/transfer`, {
      labourIds: command.labourIds,
      toProjectId: command.toProjectId,
      transferDate: command.transferDate,
      remark: command.remark,
    });
  return postJson(itemUrl(command.id, `/${command.kind}`));
}

/** Activate, deactivate, delete and transfer from the list. */
export function useLabourCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runLabourCommand,
    onSettled: () => queryClient.invalidateQueries({ queryKey: LABOURS_KEY }),
  });
}

export function useCreateLabour() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createLabour,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LABOURS_KEY }),
  });
}

export function useUpdateLabour(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LabourUpdateInput) => updateLabour(id, input),
    onSuccess: async (updated) => {
      queryClient.setQueryData(labourQuery(id).queryKey, updated);
      await queryClient.invalidateQueries({ queryKey: LABOURS_KEY });
    },
  });
}

export function uploadLabourPhoto(id: string, file: File) {
  return postFile<{ photoUrl: string | null }>(itemUrl(id, "/photo"), file);
}

export function removeLabourPhoto(id: string) {
  return postJson<{ photoUrl: null }>(itemUrl(id, "/photo/remove"));
}

export function addLabourDocument(id: string, file: File) {
  return postFile<LabourDocument>(
    itemUrl(id, `/documents?fileName=${encodeURIComponent(file.name)}`),
    file,
  );
}

export function deleteLabourDocument(id: string, documentId: string) {
  return postJson<undefined>(
    itemUrl(id, `/documents/${encodeURIComponent(documentId)}/delete`),
  );
}

const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Uploads the sheet: a dry run returns the preview; an import returns the
 * preview with `imported`, or the preview of a refused import (400
 * `IMPORT_HAS_ERRORS`) as if it were a dry run.
 */
export async function importLabours(
  file: File,
  dryRun: boolean,
): Promise<LabourImportPreview> {
  try {
    return await postFile<LabourImportPreview>(
      `${LABOURS_API}/import?dryRun=${String(dryRun)}`,
      file,
      XLSX,
    );
  } catch (error) {
    if (
      error instanceof QueryHttpError &&
      error.code === "IMPORT_HAS_ERRORS" &&
      error.details != null &&
      typeof error.details === "object"
    )
      return { ...(error.details as LabourImportPreview), imported: 0 };
    throw error;
  }
}

export const LABOUR_TEMPLATE_URL = `${LABOURS_API}/import-template`;

export function labourExportUrl(
  filter: Omit<LabourListFilter, "cursor">,
): string {
  const params = labourFilterParams(filter).toString();
  return `${LABOURS_API}/export${params.length > 0 ? `?${params}` : ""}`;
}
