import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type {
  AddConstructionTrackingInspectionObservationRequestModel,
  BulkDecideConstructionTrackingInspectionsResponse,
  ConstructionTrackingInspectionResponse,
  CreateConstructionTrackingInspectionRequestModel,
  GetConstructionTrackingInspectionFormOptionsResponse,
  GetConstructionTrackingInspectionReinspectionResponse,
  ListConstructionTrackingInspectionObservationsResponse,
  ListConstructionTrackingInspectionRemarksResponse,
  ListConstructionTrackingInspectionsResponse,
  UpdateConstructionTrackingInspectionRequestModel,
} from "@/app/api/construction/tracking/inspections/inspection-models";
import type { LocationType } from "@/src/shared-kernel/location-ref";
import type { InspectionStatus } from "@/src/tracking/domain/inspection";

import { apiJson } from "./http";
import { TRACKING_API, TRACKING_KEY } from "./tracking-access";
import { trackingDocumentKey } from "./tracking-documents";

export type Inspection = ConstructionTrackingInspectionResponse;
export type InspectionPage = ListConstructionTrackingInspectionsResponse;
export type InspectionFormOptions =
  GetConstructionTrackingInspectionFormOptionsResponse;
export type InspectionReinspection =
  GetConstructionTrackingInspectionReinspectionResponse;
export type InspectionObservation =
  ListConstructionTrackingInspectionObservationsResponse["items"][number];
export type InspectionRemark =
  ListConstructionTrackingInspectionRemarksResponse["items"][number];
export type InspectionBulkOutcome =
  BulkDecideConstructionTrackingInspectionsResponse;
export type CreateInspectionInput = z.input<
  typeof CreateConstructionTrackingInspectionRequestModel
>;
export type UpdateInspectionInput = z.input<
  typeof UpdateConstructionTrackingInspectionRequestModel
>;
export type AddObservationInput = z.input<
  typeof AddConstructionTrackingInspectionObservationRequestModel
>;

export const INSPECTIONS_API = `${TRACKING_API}/inspections`;
/** Every Inspection Request read; writes invalidate it (CM-804). */
export const INSPECTIONS_KEY = [...TRACKING_KEY, "inspections"] as const;

export type InspectionFilters = {
  status?: InspectionStatus | null;
  departmentId?: string | null;
  contractorId?: string | null;
  inspectorMemberId?: string | null;
  location?: { type: LocationType; id: string } | null;
  from?: string;
  to?: string;
  search?: string;
  cursor?: { after?: string; before?: string } | null;
};

/** A Project's Inspection Requests, newest first, with counts by status. */
export function inspectionsQuery(
  projectId: string,
  filters: InspectionFilters = {},
) {
  const params = new URLSearchParams({ projectId, limit: "25" });
  if (filters.status != null) params.set("status", filters.status);
  if (filters.departmentId != null && filters.departmentId !== "")
    params.set("departmentId", filters.departmentId);
  if (filters.contractorId != null && filters.contractorId !== "")
    params.set("contractorId", filters.contractorId);
  if (filters.inspectorMemberId != null && filters.inspectorMemberId !== "")
    params.set("inspectorMemberId", filters.inspectorMemberId);
  if (filters.location != null) {
    params.set("locationType", filters.location.type);
    params.set("locationId", filters.location.id);
  }
  if (filters.from != null && filters.from !== "")
    params.set("from", filters.from);
  if (filters.to != null && filters.to !== "") params.set("to", filters.to);
  const search = filters.search?.trim() ?? "";
  if (search !== "") params.set("search", search);
  if (filters.cursor?.after != null) params.set("after", filters.cursor.after);
  if (filters.cursor?.before != null)
    params.set("before", filters.cursor.before);
  return queryOptions({
    queryKey: [...INSPECTIONS_KEY, "list", params.toString()],
    queryFn: () => apiJson<InspectionPage>(`${INSPECTIONS_API}?${params}`),
  });
}

const item = (id: string) => `${INSPECTIONS_API}/${encodeURIComponent(id)}`;

export function inspectionQuery(id: string) {
  return queryOptions({
    queryKey: [...INSPECTIONS_KEY, "detail", id],
    queryFn: () => apiJson<Inspection>(item(id)),
  });
}

export function inspectionObservationsQuery(id: string) {
  return queryOptions({
    queryKey: [...INSPECTIONS_KEY, "detail", id, "observations"],
    queryFn: () =>
      apiJson<ListConstructionTrackingInspectionObservationsResponse>(
        `${item(id)}/observations`,
      ),
  });
}

export function inspectionRemarksQuery(id: string) {
  return queryOptions({
    queryKey: [...INSPECTIONS_KEY, "detail", id, "remarks"],
    queryFn: () =>
      apiJson<ListConstructionTrackingInspectionRemarksResponse>(
        `${item(id)}/remarks`,
      ),
  });
}

/** **Raise re-inspection** prefill of a rejected request. */
export function inspectionReinspectionQuery(id: string) {
  return queryOptions({
    queryKey: [...INSPECTIONS_KEY, "reinspection", id],
    queryFn: () => apiJson<InspectionReinspection>(`${item(id)}/reinspection`),
  });
}

/** Inspectors, Departments, Contractors and Drawings on the Project. */
export function inspectionFormOptionsQuery(projectId: string) {
  const params = new URLSearchParams({ projectId });
  return queryOptions({
    queryKey: [...INSPECTIONS_KEY, "form-options", projectId],
    queryFn: () =>
      apiJson<InspectionFormOptions>(
        `${INSPECTIONS_API}/form-options?${params}`,
      ),
    staleTime: 60_000,
  });
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(`${INSPECTIONS_API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function useInvalidate() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: INSPECTIONS_KEY });
}

export function useCreateInspection() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateInspectionInput) => post<Inspection>("", input),
    onSuccess: invalidate,
  });
}

export function useUpdateInspection(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: UpdateInspectionInput) =>
      post<Inspection>(`/${encodeURIComponent(id)}/update`, input),
    onSuccess: invalidate,
  });
}

/** Approve, Reject (with **Also raise a snag**) or Delete one request. */
export type InspectionCommand =
  | { kind: "approve"; id: string; expectedUpdatedAt: string }
  | {
      kind: "reject";
      id: string;
      reason: string;
      raiseSnag: boolean;
      expectedUpdatedAt: string;
    }
  | { kind: "delete"; id: string; expectedUpdatedAt: string };

export function useInspectionCommand() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (command: InspectionCommand) => {
      const path = `/${encodeURIComponent(command.id)}`;
      switch (command.kind) {
        case "approve":
          return post<Inspection>(`${path}/approve`, {
            expectedUpdatedAt: command.expectedUpdatedAt,
          });
        case "reject":
          return post<Inspection>(`${path}/reject`, {
            reason: command.reason,
            raiseSnag: command.raiseSnag,
            expectedUpdatedAt: command.expectedUpdatedAt,
          });
        case "delete":
          await post<undefined>(`${path}/delete`, {
            expectedUpdatedAt: command.expectedUpdatedAt,
          });
          return null;
      }
    },
    onSuccess: async (_result, command) => {
      // A deleted request's page is left next; its detail must not refetch into a 404.
      await client.invalidateQueries({
        queryKey: INSPECTIONS_KEY,
        predicate: (query) =>
          command.kind !== "delete" || !query.queryKey.includes(command.id),
      });
    },
  });
}

export type BulkInspectionDecision =
  | { approve: true; projectId: string; ids: string[] }
  | {
      approve: false;
      projectId: string;
      ids: string[];
      reason: string;
      raiseSnag: boolean;
    };

/** Bulk approve or reject the selected pending requests; the rest are skipped. */
export function useBulkDecideInspections() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (decision: BulkInspectionDecision) =>
      decision.approve
        ? post<InspectionBulkOutcome>("/bulk-approve", {
            projectId: decision.projectId,
            ids: decision.ids,
          })
        : post<InspectionBulkOutcome>("/bulk-reject", {
            projectId: decision.projectId,
            ids: decision.ids,
            reason: decision.reason,
            raiseSnag: decision.raiseSnag,
          }),
    onSuccess: invalidate,
  });
}

export function useAddObservation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AddObservationInput) =>
      post<InspectionObservation>(
        `/${encodeURIComponent(id)}/observations`,
        input,
      ),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: inspectionObservationsQuery(id).queryKey,
        }),
        client.invalidateQueries({
          queryKey: trackingDocumentKey("inspection", id),
        }),
      ]);
    },
  });
}

export function useDeleteObservation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (observationId: string) =>
      post<undefined>(
        `/${encodeURIComponent(id)}/observations/${encodeURIComponent(observationId)}/delete`,
        {},
      ),
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: inspectionObservationsQuery(id).queryKey,
      });
    },
  });
}

export function useAddRemark(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      post<InspectionRemark>(`/${encodeURIComponent(id)}/remarks`, { body }),
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: inspectionRemarksQuery(id).queryKey,
      });
    },
  });
}

/** Pages of a Project's Inspection Requests. */
export function inspectionsPath(projectId: string, rest = ""): string {
  return `/app/projects/${encodeURIComponent(projectId)}/inspections${rest}`;
}

/** **Raise re-inspection**: the Add page prefilled from a rejected request. */
export function reinspectionPath(projectId: string, id: string): string {
  return inspectionsPath(projectId, `/new?reinspect=${encodeURIComponent(id)}`);
}

/** The Issue & Snag a rejection raised (CM-803's page). */
export function snagPath(projectId: string, issueId: string): string {
  return `/app/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(issueId)}`;
}

/** A linked drawing opens its album in Project Drawings. */
export function drawingAlbumPath(projectId: string, albumId: string): string {
  return `/app/projects/${encodeURIComponent(projectId)}/drawings/${encodeURIComponent(albumId)}`;
}
