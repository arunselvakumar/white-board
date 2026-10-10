import { z } from "zod";

import type {
  StoreReadModel,
  StoreStockRow,
} from "@/src/procurement/application/store-handlers";
import { STOCK_STATES } from "@/src/procurement/domain/central-inventory";
import { gstStateName } from "@/src/shared-kernel/gst-states";

export const STORES_PATH = "/api/construction/procurement/stores";

/** A quantity in JSON: a decimal string with at most 3 decimals. */
export const quantityString = z
  .string()
  .regex(/^-?\d{1,11}(\.\d{1,3})?$/, "At most 3 decimals.");

export const NamedModel = z.object({ id: z.uuid(), name: z.string() });

export const cursorQuery = {
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  after: z.string().min(1).optional(),
  before: z.string().min(1).optional(),
};

export function exclusiveCursors(value: {
  after?: string;
  before?: string;
}): boolean {
  return value.after == null || value.before == null;
}

export const cursorRefinement = {
  message: "after and before are mutually exclusive.",
  path: ["after"],
};

// Requests

const storeFields = {
  name: z.string().max(200),
  address: z.string().max(1000).nullable().optional(),
  /** GST state code (`GST_STATES`), e.g. `33` for Tamil Nadu. */
  stateCode: z.string().max(2).nullable().optional(),
  /** At least one live Project the store serves. */
  projectIds: z.array(z.uuid()).max(200),
  /** Store keepers: Team Members. */
  keeperIds: z.array(z.uuid()).max(200).optional(),
  /** Suppliers a Purchase Order for the store may name (active when added). */
  supplierIds: z.array(z.uuid()).max(500).optional(),
};

export const CreateConstructionProcurementStoreRequestModel =
  z.object(storeFields);
export type CreateConstructionProcurementStoreRequestModel = z.infer<
  typeof CreateConstructionProcurementStoreRequestModel
>;

export const UpdateConstructionProcurementStoreRequestModel = z.object({
  ...storeFields,
  /** The store's `updatedAt` as loaded; 409 `STORE_CHANGED` when stale. */
  expectedUpdatedAt: z.iso.datetime(),
});

export const DeleteConstructionProcurementStoreRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime(),
});

export const ListConstructionProcurementStoresRequestModel = z
  .object({
    search: z.string().max(200).optional(),
    projectId: z.uuid().optional(),
    ...cursorQuery,
  })
  .refine(exclusiveCursors, cursorRefinement);

export const ConstructionProcurementStoreParamsModel = z.object({
  id: z.uuid(),
});

export const ListConstructionProcurementStoreOptionsRequestModel = z.object({
  /** Only stores serving this Project ("Request To"). */
  projectId: z.uuid().optional(),
});

// Responses

export const ConstructionProcurementStoreResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.string().nullable(),
  stateCode: z.string().nullable(),
  stateName: z.string().nullable(),
  projects: z.array(NamedModel),
  keepers: z.array(NamedModel),
  suppliers: z.array(NamedModel),
  createdAt: z.iso.datetime(),
  /** Send back as `expectedUpdatedAt`. */
  updatedAt: z.iso.datetime(),
});
export type ConstructionProcurementStoreResponseModel = z.infer<
  typeof ConstructionProcurementStoreResponseModel
>;

export const ListConstructionProcurementStoresResponseModel = z.object({
  items: z.array(ConstructionProcurementStoreResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int().nonnegative(),
});
export type ListConstructionProcurementStoresResponseModel = z.infer<
  typeof ListConstructionProcurementStoresResponseModel
>;

export const ConstructionProcurementStoreStockRowResponseModel = z.object({
  materialId: z.uuid(),
  materialName: z.string(),
  uomName: z.string(),
  categoryId: z.uuid().nullable(),
  categoryName: z.string().nullable(),
  stock: quantityString,
  /** Dispatched to the store by approved transfers, not yet delivered. */
  inTransit: quantityString,
  minimum: quantityString.nullable(),
  state: z.enum(STOCK_STATES),
});

export const GetConstructionProcurementStoreStockResponseModel = z.object({
  items: z.array(ConstructionProcurementStoreStockRowResponseModel),
});
export type GetConstructionProcurementStoreStockResponseModel = z.infer<
  typeof GetConstructionProcurementStoreStockResponseModel
>;

export const ConstructionProcurementStoreOptionResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  stateCode: z.string().nullable(),
});

export const ListConstructionProcurementStoreOptionsResponseModel = z.object({
  items: z.array(ConstructionProcurementStoreOptionResponseModel),
});
export type ListConstructionProcurementStoreOptionsResponseModel = z.infer<
  typeof ListConstructionProcurementStoreOptionsResponseModel
>;

export const GetConstructionProcurementStoreFormOptionsResponseModel = z.object(
  {
    projects: z.array(NamedModel),
    teamMembers: z.array(NamedModel),
    suppliers: z.array(NamedModel),
  },
);
export type GetConstructionProcurementStoreFormOptionsResponseModel = z.infer<
  typeof GetConstructionProcurementStoreFormOptionsResponseModel
>;

export function toStoreResponse(
  store: StoreReadModel,
): ConstructionProcurementStoreResponseModel {
  return {
    id: store.id,
    name: store.name,
    address: store.address,
    stateCode: store.stateCode,
    stateName: store.stateCode == null ? null : gstStateName(store.stateCode),
    projects: store.projects,
    keepers: store.keepers,
    suppliers: store.suppliers,
    createdAt: store.createdAt.toISOString(),
    updatedAt: store.updatedAt.toISOString(),
  };
}

export function toStoreStockRow(row: StoreStockRow) {
  return { ...row };
}
