import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionContractsBoqFormOptionsResponseModel,
  ConstructionContractsBoqItemModel,
  ConstructionContractsBoqLibraryItemModel,
  ConstructionContractsBoqSectionModel,
  ConstructionContractsBoqSectionResponseModel,
  ConstructionContractsBoqSettingsResponseModel,
  ConstructionContractsVariationModel,
  CreateConstructionContractsBoqItemRequestModel,
  CreateConstructionContractsVariationRequestModel,
  GetConstructionContractsBoqItemResponseModel,
  GetConstructionContractsBoqResponseModel,
  ImportConstructionContractsBoqResponseModel,
  ListConstructionContractsBoqDeviationsResponseModel,
  ListConstructionContractsBoqLibraryItemsResponseModel,
  ListConstructionContractsVariationsResponseModel,
  UpdateConstructionContractsBoqItemRequestModel,
  UpdateConstructionContractsVariationRequestModel,
} from "@/app/api/construction/contracts/boq/boq-models";
import type { VariationStatus } from "@/src/contracts/domain/variation";

import { CONTRACTS_API, CONTRACTS_KEY } from "./contracts-access";
import { apiJson } from "./http";

export type Boq = GetConstructionContractsBoqResponseModel;
export type BoqSection = ConstructionContractsBoqSectionModel;
export type BoqItem = ConstructionContractsBoqItemModel;
export type BoqItemDetail = GetConstructionContractsBoqItemResponseModel;
export type BoqFormOptions = ConstructionContractsBoqFormOptionsResponseModel;
export type BoqLibraryItem = ConstructionContractsBoqLibraryItemModel;
export type BoqItemInput = CreateConstructionContractsBoqItemRequestModel;
export type BoqItemUpdate = UpdateConstructionContractsBoqItemRequestModel;
export type BoqDeviations = ListConstructionContractsBoqDeviationsResponseModel;
export type BoqDeviation = BoqDeviations["items"][number];
export type BoqSettings = ConstructionContractsBoqSettingsResponseModel;
export type BoqImportResult = ImportConstructionContractsBoqResponseModel;
export type Variation = ConstructionContractsVariationModel;
export type VariationPage = ListConstructionContractsVariationsResponseModel;
export type VariationInput = CreateConstructionContractsVariationRequestModel;
export type VariationUpdate = UpdateConstructionContractsVariationRequestModel;

/** A problem in an uploaded sheet (400 IMPORT_HAS_ERRORS `details.errors`). */
export type BoqImportRowError = {
  row: number;
  column: string;
  message: string;
};

export const BOQ_API = `${CONTRACTS_API}/boq`;

/** Every BOQ query key starts here (CM-1103). */
export const BOQ_KEY = [...CONTRACTS_KEY, "boq"] as const;

const project = (projectId: string) =>
  `projectId=${encodeURIComponent(projectId)}`;

export function boqQuery(projectId: string) {
  return queryOptions({
    queryKey: [...BOQ_KEY, "boq", projectId] as const,
    queryFn: () => apiJson<Boq>(`${BOQ_API}?${project(projectId)}`),
  });
}

export function boqItemQuery(id: string) {
  return queryOptions({
    queryKey: [...BOQ_KEY, "item", id] as const,
    queryFn: () =>
      apiJson<BoqItemDetail>(`${BOQ_API}/items/${encodeURIComponent(id)}`),
  });
}

/** UoMs, the Project's Wings or Locations and its sections for the forms. */
export function boqFormOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: [...BOQ_KEY, "form-options", projectId] as const,
    queryFn: () =>
      apiJson<BoqFormOptions>(`${BOQ_API}/form-options?${project(projectId)}`),
  });
}

/** Item Library Items to copy, by code or description (a server search). */
export function boqLibraryItemsQuery(projectId: string, search: string) {
  const query = new URLSearchParams({ projectId });
  if (search.trim() !== "") query.set("q", search.trim());
  return queryOptions({
    queryKey: [...BOQ_KEY, "library", projectId, search.trim()] as const,
    queryFn: async () =>
      (
        await apiJson<ListConstructionContractsBoqLibraryItemsResponseModel>(
          `${BOQ_API}/library-items?${query.toString()}`,
        )
      ).items,
  });
}

export type VariationFilter = {
  status: VariationStatus | "";
  cursor: { after: string } | { before: string } | null;
};

export function variationsQuery(projectId: string, filter: VariationFilter) {
  const query = new URLSearchParams({ projectId });
  if (filter.status !== "") query.set("status", filter.status);
  if (filter.cursor != null) {
    if ("after" in filter.cursor) query.set("after", filter.cursor.after);
    else query.set("before", filter.cursor.before);
  }
  const text = query.toString();
  return queryOptions({
    queryKey: [...BOQ_KEY, "variations", text] as const,
    queryFn: () => apiJson<VariationPage>(`${BOQ_API}/variations?${text}`),
  });
}

export function boqDeviationsQuery(projectId: string) {
  return queryOptions({
    queryKey: [...BOQ_KEY, "deviations", projectId] as const,
    queryFn: () =>
      apiJson<BoqDeviations>(`${BOQ_API}/deviations?${project(projectId)}`),
  });
}

export function boqSettingsQuery() {
  return queryOptions({
    queryKey: [...BOQ_KEY, "settings"] as const,
    queryFn: () => apiJson<BoqSettings>(`${BOQ_API}/settings`),
  });
}

export const boqSampleUrl = (projectId: string) =>
  `${BOQ_API}/sample?${project(projectId)}`;
export const boqExportUrl = (projectId: string) =>
  `${BOQ_API}/export?${project(projectId)}`;

function post<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Every BOQ read: a write may change totals, deviations and Variations. */
function useInvalidateBoq() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: BOQ_KEY });
}

export type SectionCommand =
  | { kind: "create"; projectId: string; title: string }
  | { kind: "rename"; id: string; title: string; expectedUpdatedAt: string }
  | { kind: "move"; id: string; direction: "up" | "down" }
  | { kind: "delete"; id: string; expectedUpdatedAt: string };

export function useSectionCommand() {
  const invalidate = useInvalidateBoq();
  return useMutation({
    mutationFn: (command: SectionCommand) => {
      switch (command.kind) {
        case "create":
          return post<ConstructionContractsBoqSectionResponseModel>(
            `${BOQ_API}/sections`,
            { projectId: command.projectId, title: command.title },
          );
        case "rename":
          return post<ConstructionContractsBoqSectionResponseModel>(
            `${BOQ_API}/sections/${encodeURIComponent(command.id)}/update`,
            {
              title: command.title,
              expectedUpdatedAt: command.expectedUpdatedAt,
            },
          );
        case "move":
          return post<null>(
            `${BOQ_API}/sections/${encodeURIComponent(command.id)}/move`,
            { direction: command.direction },
          );
        case "delete":
          return post<null>(
            `${BOQ_API}/sections/${encodeURIComponent(command.id)}/delete`,
            { expectedUpdatedAt: command.expectedUpdatedAt },
          );
      }
    },
    onSuccess: invalidate,
  });
}

export function useCreateBoqItem() {
  const invalidate = useInvalidateBoq();
  return useMutation({
    mutationFn: (input: BoqItemInput) =>
      post<BoqItem>(`${BOQ_API}/items`, input),
    onSuccess: invalidate,
  });
}

export function useUpdateBoqItem(id: string) {
  const invalidate = useInvalidateBoq();
  return useMutation({
    mutationFn: (input: BoqItemUpdate) =>
      post<BoqItem>(`${BOQ_API}/items/${encodeURIComponent(id)}/update`, input),
    onSuccess: invalidate,
  });
}

export type ItemCommand =
  | { kind: "move"; id: string; direction: "up" | "down" }
  | { kind: "delete"; id: string; expectedUpdatedAt: string };

export function useBoqItemCommand() {
  const invalidate = useInvalidateBoq();
  return useMutation({
    mutationFn: (command: ItemCommand) =>
      command.kind === "move"
        ? post<null>(
            `${BOQ_API}/items/${encodeURIComponent(command.id)}/move`,
            {
              direction: command.direction,
            },
          )
        : post<null>(
            `${BOQ_API}/items/${encodeURIComponent(command.id)}/delete`,
            { expectedUpdatedAt: command.expectedUpdatedAt },
          ),
    onSuccess: invalidate,
  });
}

export function useCreateVariation() {
  const invalidate = useInvalidateBoq();
  return useMutation({
    mutationFn: (input: VariationInput) =>
      post<Variation>(`${BOQ_API}/variations`, input),
    onSuccess: invalidate,
  });
}

export function useUpdateVariation(id: string) {
  const invalidate = useInvalidateBoq();
  return useMutation({
    mutationFn: (input: VariationUpdate) =>
      post<Variation>(
        `${BOQ_API}/variations/${encodeURIComponent(id)}/update`,
        input,
      ),
    onSuccess: invalidate,
  });
}

export type VariationCommand =
  | { kind: "approve"; id: string }
  | { kind: "reject"; id: string; reason: string }
  | { kind: "delete"; id: string; expectedUpdatedAt: string };

export function useVariationCommand() {
  const invalidate = useInvalidateBoq();
  return useMutation({
    mutationFn: (command: VariationCommand) => {
      const path = `${BOQ_API}/variations/${encodeURIComponent(command.id)}`;
      switch (command.kind) {
        case "approve":
          return post<Variation | null>(`${path}/approve`, {});
        case "reject":
          return post<Variation | null>(`${path}/reject`, {
            reason: command.reason,
          });
        case "delete":
          return post<Variation | null>(`${path}/delete`, {
            expectedUpdatedAt: command.expectedUpdatedAt,
          });
      }
    },
    onSuccess: invalidate,
  });
}

export function useUpdateBoqSettings() {
  const invalidate = useInvalidateBoq();
  return useMutation({
    mutationFn: (deviationLimitPercent: string) =>
      post<BoqSettings>(`${BOQ_API}/settings/update`, {
        deviationLimitPercent,
      }),
    onSuccess: invalidate,
  });
}

/** Uploads the filled sample; every row or none. */
export function useImportBoq(projectId: string) {
  const invalidate = useInvalidateBoq();
  return useMutation({
    mutationFn: (file: File) =>
      apiJson<BoqImportResult>(`${BOQ_API}/import?${project(projectId)}`, {
        method: "POST",
        headers: {
          "content-type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        body: file,
      }),
    onSuccess: invalidate,
  });
}
