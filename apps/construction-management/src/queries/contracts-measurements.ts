import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionContractsMeasurementFormOptionsResponseModel,
  ConstructionContractsMeasurementPhotoModel,
  ConstructionContractsMeasurementSummaryModel,
  CreateConstructionContractsMeasurementRequestModel,
  GetConstructionContractsMeasurementResponseModel,
  ListConstructionContractsMeasurementPhotosResponseModel,
  ListConstructionContractsMeasurementQuantitiesResponseModel,
  ListConstructionContractsMeasurementsResponseModel,
  UpdateConstructionContractsMeasurementRequestModel,
} from "@/app/api/construction/contracts/measurements/measurement-models";
import type {
  MeasurementStatus,
  Side,
} from "@/src/contracts/domain/contract-terms";

import { BOQ_KEY } from "./contracts-boq";
import { CONTRACTS_API, CONTRACTS_KEY } from "./contracts-access";
import { directUpload, postJson, type UploadOptions } from "./direct-upload";
import { apiJson, QueryHttpError } from "./http";

export type MeasurementSheet = GetConstructionContractsMeasurementResponseModel;
export type MeasurementSummary = ConstructionContractsMeasurementSummaryModel;
export type MeasurementPage =
  ListConstructionContractsMeasurementsResponseModel;
export type MeasurementRow = MeasurementSheet["rows"][number];
export type MeasuredItem = MeasurementSheet["items"][number];
export type MeasurementFormOptions =
  ConstructionContractsMeasurementFormOptionsResponseModel;
export type MeasurementQuantities =
  ListConstructionContractsMeasurementQuantitiesResponseModel;
export type MeasurementPhoto = ConstructionContractsMeasurementPhotoModel;
export type MeasurementPhotos =
  ListConstructionContractsMeasurementPhotosResponseModel;
export type MeasurementInput =
  CreateConstructionContractsMeasurementRequestModel;
export type MeasurementUpdate =
  UpdateConstructionContractsMeasurementRequestModel;

export const MEASUREMENTS_API = `${CONTRACTS_API}/measurements`;

/** Every Measurement Book query key starts here (CM-1105). */
export const MEASUREMENTS_KEY = [...CONTRACTS_KEY, "measurements"] as const;

/** `/app/projects/{id}/measurements`, a new sheet, or one sheet. */
export function measurementsPath(projectId: string, id?: string): string {
  const base = `/app/projects/${projectId}/measurements`;
  return id == null ? base : `${base}/${id}`;
}

export type MeasurementFilters = {
  side: Side | "";
  workOrderId: string;
  status: MeasurementStatus | "";
  cursor: { after: string } | { before: string } | null;
};

export function measurementsQuery(
  projectId: string,
  filters: MeasurementFilters,
) {
  const query = new URLSearchParams({ projectId });
  if (filters.side !== "") query.set("side", filters.side);
  if (filters.workOrderId !== "") query.set("workOrderId", filters.workOrderId);
  if (filters.status !== "") query.set("status", filters.status);
  if (filters.cursor != null) {
    if ("after" in filters.cursor) query.set("after", filters.cursor.after);
    else query.set("before", filters.cursor.before);
  }
  const text = query.toString();
  return queryOptions({
    queryKey: [...MEASUREMENTS_KEY, "list", text] as const,
    queryFn: () => apiJson<MeasurementPage>(`${MEASUREMENTS_API}?${text}`),
  });
}

export function measurementQuery(id: string) {
  return queryOptions({
    queryKey: [...MEASUREMENTS_KEY, "detail", id] as const,
    queryFn: () =>
      apiJson<MeasurementSheet>(
        `${MEASUREMENTS_API}/${encodeURIComponent(id)}`,
      ),
  });
}

/** The BOQ's items and the issued Work Orders with their lines. */
export function measurementFormOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: [...MEASUREMENTS_KEY, "form-options", projectId] as const,
    queryFn: () =>
      apiJson<MeasurementFormOptions>(
        `${MEASUREMENTS_API}/form-options?projectId=${encodeURIComponent(projectId)}`,
      ),
  });
}

/** Measured to date per item of a side (and Work Order). */
export function measurementQuantitiesQuery(
  projectId: string,
  side: Side,
  workOrderId: string | null,
) {
  const query = new URLSearchParams({ projectId, side });
  if (workOrderId != null) query.set("workOrderId", workOrderId);
  const text = query.toString();
  return queryOptions({
    queryKey: [...MEASUREMENTS_KEY, "quantities", text] as const,
    queryFn: () =>
      apiJson<MeasurementQuantities>(`${MEASUREMENTS_API}/quantities?${text}`),
  });
}

export function measurementPhotosQuery(id: string) {
  return queryOptions({
    queryKey: [...MEASUREMENTS_KEY, "photos", id] as const,
    queryFn: () =>
      apiJson<MeasurementPhotos>(
        `${MEASUREMENTS_API}/${encodeURIComponent(id)}/photos`,
      ),
  });
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** A check or reopen changes what the BOQ counts as measured. */
function useInvalidateMeasurements() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: MEASUREMENTS_KEY }),
      client.invalidateQueries({ queryKey: BOQ_KEY }),
    ]);
}

export function useCreateMeasurement() {
  const invalidate = useInvalidateMeasurements();
  return useMutation({
    mutationFn: (input: MeasurementInput) =>
      post<MeasurementSheet>(MEASUREMENTS_API, input),
    onSuccess: invalidate,
  });
}

export function useUpdateMeasurement(id: string) {
  const invalidate = useInvalidateMeasurements();
  return useMutation({
    mutationFn: (input: MeasurementUpdate) =>
      post<MeasurementSheet>(
        `${MEASUREMENTS_API}/${encodeURIComponent(id)}/update`,
        input,
      ),
    onSuccess: invalidate,
  });
}

export type MeasurementCommand =
  | { kind: "submit" | "delete"; expectedUpdatedAt: string }
  | {
      kind: "check";
      partyName: string;
      partyRole: string;
      jointOn: string;
      expectedUpdatedAt: string;
    }
  | { kind: "return" | "reopen"; reason: string; expectedUpdatedAt: string };

export function useMeasurementCommand(id: string) {
  const client = useQueryClient();
  const invalidate = useInvalidateMeasurements();
  const detail = measurementQuery(id).queryKey;
  return useMutation({
    mutationFn: ({ kind, ...body }: MeasurementCommand) =>
      post<MeasurementSheet | null>(
        `${MEASUREMENTS_API}/${encodeURIComponent(id)}/${kind}`,
        body,
      ),
    onSuccess: (_saved, command) => {
      if (command.kind !== "delete") return invalidate();
      // The deleted sheet's own page is left; refetching it would 404.
      return Promise.all([
        client.invalidateQueries({
          queryKey: MEASUREMENTS_KEY,
          predicate: (query) =>
            JSON.stringify(query.queryKey) !== JSON.stringify(detail),
        }),
        client.invalidateQueries({ queryKey: BOQ_KEY }),
      ]);
    },
  });
}

/** Uploads one photo to a sheet (start, bytes, complete). */
export function uploadMeasurementPhoto(
  id: string,
  file: File,
  options: UploadOptions = {},
): Promise<MeasurementPhoto> {
  const base = `${MEASUREMENTS_API}/${encodeURIComponent(id)}/photos`;
  return directUpload({
    startUrl: `${base}/uploads`,
    file,
    options,
    complete: (started, signal) =>
      postJson<MeasurementPhoto>(
        base,
        { key: started.key, fileName: started.fileName },
        signal,
      ),
  });
}

export function useUploadMeasurementPhoto(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadMeasurementPhoto(id, file),
    onSettled: () => client.invalidateQueries({ queryKey: MEASUREMENTS_KEY }),
  });
}

export function useRemoveMeasurementPhoto(id: string) {
  const client = useQueryClient();
  const refresh = () =>
    client.invalidateQueries({ queryKey: MEASUREMENTS_KEY });
  return useMutation({
    mutationFn: (photoId: string) =>
      postJson<undefined>(
        `${MEASUREMENTS_API}/${encodeURIComponent(id)}/photos/${encodeURIComponent(photoId)}/delete`,
        {},
      ),
    onSuccess: refresh,
    onError: (error) =>
      error instanceof QueryHttpError && error.status === 404
        ? refresh()
        : undefined,
  });
}
