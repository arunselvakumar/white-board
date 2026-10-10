import type { AccessSession } from "@/app/api/_lib/require-access";
import { procurementMaterialUsage } from "@/src/composition/procurement-usage";
import type { MaterialReadModel } from "@/src/masters/application/material-master-handlers";
import { createMaterialHandlers } from "@/src/masters/infrastructure/create-material-handlers";
import { can, type MenuKey } from "@/src/shared-kernel/access";

import { listParams, pagedMasterRoutes } from "../_lib/paged-master-routes";
import {
  CreateConstructionMastersMaterialRequestModel,
  ListConstructionMastersMaterialsQueryModel,
  UpdateConstructionMastersMaterialRequestModel,
  toMaterialResponse,
} from "./material-models";

/** Materials' handlers; delete asks procurement whether it is used. */
export const materialHandlers = createMaterialHandlers({
  usage: procurementMaterialUsage(),
});

/** Whether the caller sees and sets Rate Details (Materials Financial). */
export function seesMaterialRates(session: AccessSession): boolean {
  return can(session.access, "masters.materials", "financial");
}

function rateOf(body: {
  unitRate?: number | null;
  discount?:
    | { type: "amount"; paise: number }
    | { type: "percent"; percent: string }
    | null;
  gstRate?: string | null;
  hsnCode?: string | null;
}) {
  return {
    unitRate: body.unitRate,
    discount: body.discount,
    gstRate: body.gstRate,
    hsnCode: body.hsnCode,
  };
}

/** Materials under the `masters.materials` Menu (CM-501). */
export const materialRoutes = pagedMasterRoutes({
  menu: "masters.materials",
  listQuery: ListConstructionMastersMaterialsQueryModel,
  createModel: CreateConstructionMastersMaterialRequestModel,
  updateModel: UpdateConstructionMastersMaterialRequestModel,
  listExtra: (session) => ({ financial: seesMaterialRates(session) }),
  toResponse: (item: MaterialReadModel, session) =>
    toMaterialResponse(item, seesMaterialRates(session)),
  list: (session, query) =>
    materialHandlers.list({
      ...listParams(session.workspaceId, query),
      categoryId: query.categoryId,
      itemType: query.itemType,
      searchHsn: seesMaterialRates(session),
    }),
  get: (target) => materialHandlers.get(target.workspaceId, target.id),
  create: (session, body) =>
    materialHandlers.create({
      workspaceId: session.workspaceId,
      details: body,
      rate: seesMaterialRates(session) ? rateOf(body) : null,
      by: session.userId,
    }),
  update: (target, body) =>
    materialHandlers.update({
      ...target,
      details: body,
      rate: seesMaterialRates(target.session) ? rateOf(body) : "keep",
      expectedUpdatedAt: new Date(body.expectedUpdatedAt),
    }),
  setDisabled: (target, disabled) =>
    materialHandlers.setDisabled({ ...target, disabled }),
  delete: (target) => materialHandlers.delete(target),
});

/**
 * Who may read the picker (CM-501): Materials Read, or Read on any menu
 * whose forms pick a Material. Project-level menus are checked without a
 * Project here: the options are Company masters, not Project data.
 */
export const MATERIAL_PICKER_MENUS: readonly MenuKey[] = [
  "masters.materials",
  "procurement.manage_materials",
  "procurement.current_inventory",
  "procurement.purchase_requests",
  "procurement.purchase_orders",
  "procurement.material_received",
  "procurement.material_transfers",
  "procurement.central_inventory",
  "procurement.central_store",
  "procurement.material_requests",
  "procurement.delivery_notes",
];
