import { z } from "zod";

import {
  TRANSFER_STATUSES,
  type TransferType,
} from "@/src/procurement/domain/material-transfer";
import type {
  MaterialTransfer,
  TransferListPage,
} from "@/src/procurement/infrastructure/material-transfer-store";
import { encodeListCursor } from "@/src/shared-kernel/list-cursor";

import { ConstructionProcurementStockLocationModel } from "../inventory/inventory-models";

export const TRANSFERS_PATH = "/api/construction/procurement/transfers";

const TRANSFER_TYPES = [
  "project_to_project",
  "project_to_store",
  "store_to_project",
  "store_to_store",
] as const satisfies readonly TransferType[];

const quantityInput = z.string().trim().min(1).max(24);

// Requests

export const ListConstructionProcurementMaterialTransfersRequestModel = z
  .object({
    locationKind: z.enum(["project", "store"]),
    locationId: z.uuid(),
    /** `in` to here, `out` from here; both when left out. */
    direction: z.enum(["in", "out"]).optional(),
    status: z.enum(TRANSFER_STATUSES).optional(),
    /** Transfer date range. */
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export const GetConstructionProcurementTransferStockRequestModel = z.object({
  fromKind: z.enum(["project", "store"]),
  fromId: z.uuid(),
  /** Comma-separated Material ids. */
  materialIds: z
    .string()
    .max(4000)
    .transform((value) =>
      value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.uuid()).max(100)),
  /** Stock on this date (the transfer date); today and after when left out. */
  on: z.iso.date().optional(),
});

const transferFields = {
  /** Today or earlier (back-dated limits apply). */
  transferDate: z.iso.date(),
  from: ConstructionProcurementStockLocationModel,
  /** Not the source. */
  to: ConstructionProcurementStockLocationModel,
  lines: z
    .array(
      z.object({
        materialId: z.uuid(),
        quantity: quantityInput,
        remark: z.string().max(500).nullable().optional(),
      }),
    )
    .min(1)
    .max(100),
  receiverName: z.string().max(120).nullable().optional(),
  remark: z.string().max(500).nullable().optional(),
};

export const CreateConstructionProcurementMaterialTransferRequestModel =
  z.object({
    ...transferFields,
    /** Save & Approve: needs Approve on the source; dispatches at once. */
    approve: z.boolean().optional(),
  });

export const UpdateConstructionProcurementMaterialTransferRequestModel =
  z.object({
    ...transferFields,
    /** As last read; 409 `MATERIAL_TRANSFER_CHANGED` when stale. */
    expectedUpdatedAt: z.iso.datetime(),
  });

export const ConstructionProcurementMaterialTransferParamsModel = z.object({
  id: z.uuid(),
});

export const ApproveConstructionProcurementMaterialTransferRequestModel =
  z.object({ expectedUpdatedAt: z.iso.datetime().optional() });

export const RejectConstructionProcurementMaterialTransferRequestModel =
  z.object({ reason: z.string().max(500) });

export const DeliverConstructionProcurementMaterialTransferRequestModel =
  z.object({
    /** On or after the transfer date, not after today. */
    deliveredOn: z.iso.date(),
  });

export const DeleteConstructionProcurementMaterialTransferRequestModel =
  z.object({ expectedUpdatedAt: z.iso.datetime() });

// Responses

const person = z.object({ userId: z.string(), name: z.string().nullable() });
const namedLocation = ConstructionProcurementStockLocationModel.extend({
  name: z.string(),
});

export const ConstructionProcurementMaterialTransferResponseModel = z.object({
  id: z.uuid(),
  number: z.string(),
  transferDate: z.iso.date(),
  type: z.enum(TRANSFER_TYPES),
  from: namedLocation,
  to: namedLocation,
  receiverName: z.string().nullable(),
  remark: z.string().nullable(),
  /** pending → in transit (approved) → delivered; or rejected. */
  status: z.enum(TRANSFER_STATUSES),
  approvalStatus: z.enum(["pending", "approved", "rejected"]),
  decidedAt: z.iso.datetime().nullable(),
  decidedBy: person.nullable(),
  rejectionReason: z.string().nullable(),
  deliveredOn: z.iso.date().nullable(),
  deliveredAt: z.iso.datetime().nullable(),
  /** Who marked it delivered. */
  deliveredBy: person.nullable(),
  createdBy: person,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  lines: z.array(
    z.object({
      id: z.uuid(),
      position: z.int(),
      materialId: z.uuid(),
      materialName: z.string(),
      uomId: z.uuid(),
      uomName: z.string(),
      quantity: z.string(),
      remark: z.string().nullable(),
    }),
  ),
});
export type ConstructionProcurementMaterialTransferResponseModel = z.infer<
  typeof ConstructionProcurementMaterialTransferResponseModel
>;

export const ListConstructionProcurementMaterialTransfersResponseModel =
  z.object({
    items: z.array(ConstructionProcurementMaterialTransferResponseModel),
    nextCursor: z.string().nullable(),
    prevCursor: z.string().nullable(),
    total: z.int().nonnegative(),
  });
export type ListConstructionProcurementMaterialTransfersResponseModel = z.infer<
  typeof ListConstructionProcurementMaterialTransfersResponseModel
>;

export const GetConstructionProcurementTransferStockResponseModel = z.object({
  /** Material id → stock at the source (decimal string). */
  stock: z.record(z.string(), z.string()),
});
export type GetConstructionProcurementTransferStockResponseModel = z.infer<
  typeof GetConstructionProcurementTransferStockResponseModel
>;

export function toTransferResponse(
  transfer: MaterialTransfer,
): ConstructionProcurementMaterialTransferResponseModel {
  const place = (location: MaterialTransfer["from"]) => ({
    kind: location.kind,
    id: location.id,
    name: location.name,
  });
  const who = (person: { userId: string; name: string | null } | null) =>
    person == null ? null : { userId: person.userId, name: person.name };
  // Field by field, so nothing of the read model leaks into the response.
  return {
    id: transfer.id,
    number: transfer.number,
    transferDate: transfer.transferDate,
    type: transfer.type,
    from: place(transfer.from),
    to: place(transfer.to),
    receiverName: transfer.receiverName,
    remark: transfer.remark,
    status: transfer.status,
    approvalStatus: transfer.approvalStatus,
    decidedAt: transfer.decidedAt?.toISOString() ?? null,
    decidedBy: who(transfer.decidedBy),
    rejectionReason: transfer.rejectionReason,
    deliveredOn: transfer.deliveredOn,
    deliveredAt: transfer.deliveredAt?.toISOString() ?? null,
    deliveredBy: who(transfer.deliveredBy),
    createdBy: {
      userId: transfer.createdBy.userId,
      name: transfer.createdBy.name,
    },
    createdAt: transfer.createdAt.toISOString(),
    updatedAt: transfer.updatedAt.toISOString(),
    lines: transfer.lines.map((line) => ({
      id: line.id,
      position: line.position,
      materialId: line.materialId,
      materialName: line.materialName,
      uomId: line.uomId,
      uomName: line.uomName,
      quantity: line.quantity,
      remark: line.remark,
    })),
  };
}

export function toTransferListResponse(
  page: TransferListPage,
  paging: { after?: string; before?: string },
): ListConstructionProcurementMaterialTransfersResponseModel {
  const first = page.items[0];
  const last = page.items.at(-1);
  const backwards = paging.before != null;
  const moreAfter = backwards || page.hasMore;
  const moreBefore = backwards ? page.hasMore : paging.after != null;
  return {
    items: page.items.map(toTransferResponse),
    nextCursor: moreAfter && last != null ? encodeListCursor(last) : null,
    prevCursor: moreBefore && first != null ? encodeListCursor(first) : null,
    total: page.total,
  };
}

const named = z.object({ id: z.uuid(), name: z.string() });

export const ListConstructionProcurementTransferLocationsResponseModel =
  z.object({
    /** Every live Project of the Company, by name. */
    projects: z.array(named),
    /** Every live Store, by name. */
    stores: z.array(named),
  });
export type ListConstructionProcurementTransferLocationsResponseModel = z.infer<
  typeof ListConstructionProcurementTransferLocationsResponseModel
>;
