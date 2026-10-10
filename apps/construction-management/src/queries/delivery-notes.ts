import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionProcurementDeliveryNoteResponseModel,
  ListConstructionProcurementDeliveryNotesResponseModel,
} from "@/app/api/construction/procurement/delivery-notes/delivery-note-models";

import { apiJson } from "./http";
import { PROCUREMENT_API, PROCUREMENT_KEY } from "./procurement-access";
import { postJson } from "./stores";

export type DeliveryNote = ConstructionProcurementDeliveryNoteResponseModel;
export type DeliveryNoteStatus = DeliveryNote["status"];
export type DeliveryNotePage =
  ListConstructionProcurementDeliveryNotesResponseModel;

export const DELIVERY_NOTES_API = `${PROCUREMENT_API}/delivery-notes`;
export const DELIVERY_NOTES_KEY = [
  ...PROCUREMENT_KEY,
  "delivery-notes",
] as const;

export const DELIVERY_NOTE_STATUS_LABELS: Record<DeliveryNoteStatus, string> =
  {
    pending: "Pending",
    in_transit: "In transit",
    delivered: "Delivered",
  };

export type DeliveryNoteFilter = {
  storeId?: string;
  projectId?: string;
  materialRequestId?: string;
  status?: DeliveryNoteStatus;
  cursor?: { after?: string; before?: string };
};

export function deliveryNotesQuery(filter: DeliveryNoteFilter) {
  const query = new URLSearchParams({ limit: "25" });
  if (filter.storeId != null) query.set("storeId", filter.storeId);
  if (filter.projectId != null) query.set("projectId", filter.projectId);
  if (filter.materialRequestId != null)
    query.set("materialRequestId", filter.materialRequestId);
  if (filter.status != null) query.set("status", filter.status);
  if (filter.cursor?.after != null) query.set("after", filter.cursor.after);
  if (filter.cursor?.before != null) query.set("before", filter.cursor.before);
  const search = query.toString();
  return queryOptions({
    queryKey: [...DELIVERY_NOTES_KEY, "list", search] as const,
    queryFn: () => apiJson<DeliveryNotePage>(`${DELIVERY_NOTES_API}?${search}`),
  });
}

export function deliveryNoteQuery(id: string) {
  return queryOptions({
    queryKey: [...DELIVERY_NOTES_KEY, "detail", id] as const,
    queryFn: () =>
      apiJson<DeliveryNote>(`${DELIVERY_NOTES_API}/${encodeURIComponent(id)}`),
  });
}

export type DeliveryNoteInput = {
  deliveryDate: string;
  deliveredTo: string | null;
  remark: string | null;
  items: { materialRequestItemId: string; quantity: string }[];
};

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: PROCUREMENT_KEY });
}

export function useCreateDeliveryNote(materialRequestId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: DeliveryNoteInput & { approve: boolean }) =>
      postJson<DeliveryNote>(DELIVERY_NOTES_API, {
        materialRequestId,
        ...input,
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateDeliveryNote(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: DeliveryNoteInput & { expectedUpdatedAt: string }) =>
      postJson<DeliveryNote>(
        `${DELIVERY_NOTES_API}/${encodeURIComponent(id)}/update`,
        input,
      ),
    onSuccess: invalidate,
  });
}

/** Approve, Mark as Delivered or Delete one note. */
export type DeliveryNoteCommand =
  | { kind: "approve"; id: string }
  | { kind: "deliver"; id: string; updatedAt: string; deliveredOn: string }
  | { kind: "delete"; id: string; updatedAt: string };

export function runDeliveryNoteCommand(command: DeliveryNoteCommand) {
  const base = `${DELIVERY_NOTES_API}/${encodeURIComponent(command.id)}`;
  switch (command.kind) {
    case "approve":
      return postJson<DeliveryNote | undefined>(`${base}/approve`);
    case "deliver":
      return postJson<DeliveryNote | undefined>(`${base}/mark-delivered`, {
        deliveredOn: command.deliveredOn,
        expectedUpdatedAt: command.updatedAt,
      });
    case "delete":
      return postJson<DeliveryNote | undefined>(`${base}/delete`, {
        expectedUpdatedAt: command.updatedAt,
      });
  }
}

export function useDeliveryNoteCommand() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: runDeliveryNoteCommand,
    onSuccess: invalidate,
  });
}
