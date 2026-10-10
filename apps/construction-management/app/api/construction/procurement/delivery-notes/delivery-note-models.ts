import { z } from "zod";

import type { DeliveryNoteReadModel } from "@/src/procurement/application/delivery-note-handlers";
import { DELIVERY_NOTE_STATUSES } from "@/src/procurement/domain/delivery-note";

import {
  cursorQuery,
  cursorRefinement,
  exclusiveCursors,
  quantityString,
} from "../stores/store-models";

export const DELIVERY_NOTES_PATH =
  "/api/construction/procurement/delivery-notes";

const LineModel = z.object({
  /** A line of the Material Request. */
  materialRequestItemId: z.uuid(),
  /** Delivered now: > 0, ≤ the line's pending and ≤ the store's stock. */
  quantity: quantityString,
});

const noteFields = {
  /** `YYYY-MM-DD`, not after today; the Issued date at the store. */
  deliveryDate: z.iso.date(),
  /** "Delivered To": who receives it at the site. */
  deliveredTo: z.string().max(400).nullable().optional(),
  remark: z.string().max(1000).nullable().optional(),
  items: z.array(LineModel).max(200),
};

export const CreateConstructionProcurementDeliveryNoteRequestModel = z.object({
  materialRequestId: z.uuid(),
  ...noteFields,
  /** Save & Approve: dispatch at once (needs Delivery Note approve). */
  approve: z.boolean().optional().default(false),
});

export const UpdateConstructionProcurementDeliveryNoteRequestModel = z.object({
  ...noteFields,
  /** 409 `DELIVERY_NOTE_CHANGED` when stale. */
  expectedUpdatedAt: z.iso.datetime(),
});

export const DeleteConstructionProcurementDeliveryNoteRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime(),
});

export const ApproveConstructionProcurementDeliveryNotesRequestModel = z.object(
  {
    /** 1–100 pending notes; all or none. */
    ids: z.array(z.uuid()).min(1).max(100),
  },
);

export const MarkConstructionProcurementDeliveryNoteDeliveredRequestModel =
  z.object({
    /** `YYYY-MM-DD`: on or after the note's date, not after today. */
    deliveredOn: z.iso.date(),
    expectedUpdatedAt: z.iso.datetime(),
  });

export const ListConstructionProcurementDeliveryNotesRequestModel = z
  .object({
    storeId: z.uuid().optional(),
    /** The Project side: notes to this Project (Material Requests read, on the Project). */
    projectId: z.uuid().optional(),
    materialRequestId: z.uuid().optional(),
    status: z.enum(DELIVERY_NOTE_STATUSES).optional(),
    search: z.string().max(100).optional(),
    ...cursorQuery,
  })
  .refine(exclusiveCursors, cursorRefinement);

export const ConstructionProcurementDeliveryNoteParamsModel = z.object({
  id: z.uuid(),
});

export const ConstructionProcurementDeliveryNoteResponseModel = z.object({
  id: z.uuid(),
  number: z.string(),
  materialRequestId: z.uuid(),
  materialRequestNumber: z.string(),
  storeId: z.uuid(),
  storeName: z.string().nullable(),
  projectId: z.uuid(),
  projectName: z.string().nullable(),
  deliveryDate: z.iso.date(),
  deliveredTo: z.string().nullable(),
  remark: z.string().nullable(),
  /** pending → in transit (approved: Issued at the store) → delivered. */
  status: z.enum(DELIVERY_NOTE_STATUSES),
  approvedAt: z.iso.datetime().nullable(),
  deliveredOn: z.iso.date().nullable(),
  deliveredAt: z.iso.datetime().nullable(),
  items: z.array(
    z.object({
      id: z.uuid(),
      materialRequestItemId: z.uuid(),
      position: z.int(),
      materialId: z.uuid(),
      materialName: z.string(),
      uomName: z.string(),
      /** Delivered by this note. */
      quantity: quantityString,
      /** The request line's Ask Qty. */
      requestedQty: quantityString,
      /** The request line's pending quantity before this note. */
      pendingQty: quantityString,
    }),
  ),
  createdAt: z.iso.datetime(),
  /** Send back as `expectedUpdatedAt`. */
  updatedAt: z.iso.datetime(),
});
export type ConstructionProcurementDeliveryNoteResponseModel = z.infer<
  typeof ConstructionProcurementDeliveryNoteResponseModel
>;

export const ListConstructionProcurementDeliveryNotesResponseModel = z.object({
  items: z.array(ConstructionProcurementDeliveryNoteResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int().nonnegative(),
});
export type ListConstructionProcurementDeliveryNotesResponseModel = z.infer<
  typeof ListConstructionProcurementDeliveryNotesResponseModel
>;

export function toDeliveryNoteResponse(
  note: DeliveryNoteReadModel,
): ConstructionProcurementDeliveryNoteResponseModel {
  return {
    id: note.id,
    number: note.number,
    materialRequestId: note.materialRequestId,
    materialRequestNumber: note.materialRequestNumber,
    storeId: note.storeId,
    storeName: note.storeName,
    projectId: note.projectId,
    projectName: note.projectName,
    deliveryDate: note.deliveryDate,
    deliveredTo: note.deliveredTo,
    remark: note.remark,
    status: note.status,
    approvedAt: note.decidedAt?.toISOString() ?? null,
    deliveredOn: note.deliveredOn,
    deliveredAt: note.deliveredAt?.toISOString() ?? null,
    items: note.items,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}
