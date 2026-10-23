import { mockApi, type ApiCall } from "../../../.storybook/mocks/api";
import type {
  WorkOrder,
  WorkOrderPage,
} from "@/src/queries/contracts-work-orders";

import {
  boqItemsOf,
  FORM_OPTIONS,
  pageOf,
  workOrderOf,
} from "./work-order-fixtures";
import { AT_BILL_1 } from "./work-order-reconciliation-fixtures";

export const WORK_ORDERS_API = "/api/construction/contracts/work-orders";

export type WorkOrderStoryApi = ReturnType<typeof mockApi>;

/**
 * The Work Order reads for stories (CM-1104), with `write` answering every
 * POST (by default the Work Order as it was). Returns the spy (as
 * `holder.current`) and the restore for `beforeEach`.
 */
export function serveWorkOrders(
  options: {
    page?: WorkOrderPage;
    workOrder?: WorkOrder;
    financial?: boolean;
    write?: (call: ApiCall) => Response | undefined;
  } = {},
) {
  const financial = options.financial ?? true;
  const holder: { current: WorkOrderStoryApi | null } = { current: null };
  const beforeEach = () => {
    const api = mockApi((call) => {
      const url = new URL(call.path, "http://storybook.local");
      if (call.method === "POST")
        return (
          options.write?.(call) ??
          Response.json(options.workOrder ?? workOrderOf(), { status: 200 })
        );
      switch (url.pathname) {
        case WORK_ORDERS_API: {
          const page = options.page ?? pageOf();
          const status = url.searchParams.get("status");
          return Response.json(
            status == null
              ? page
              : {
                  ...page,
                  items: page.items.filter((item) => item.status === status),
                  total: page.items.filter((item) => item.status === status)
                    .length,
                },
          );
        }
        case `${WORK_ORDERS_API}/form-options`:
          return Response.json({ ...FORM_OPTIONS, financial });
        case `${WORK_ORDERS_API}/boq-items`:
          return Response.json(boqItemsOf(financial));
        case `${WORK_ORDERS_API}/material-options`:
          return Response.json({
            items: [
              {
                id: "0199c0de-1104-7000-8000-0000000000e1",
                name: "Cement OPC 53",
                specification: "50 kg bag",
                uomName: "Bag",
                unitRate: financial ? 380_00 : null,
              },
            ],
          });
        default:
          if (
            options.workOrder != null &&
            url.pathname === `${WORK_ORDERS_API}/${options.workOrder.id}`
          )
            return Response.json(options.workOrder);
          // CM-1110: the material reconciliation panel of an issued one.
          if (
            options.workOrder != null &&
            url.pathname ===
              `${WORK_ORDERS_API}/${options.workOrder.id}/reconciliation`
          )
            return Response.json({
              ...AT_BILL_1,
              workOrder: { ...AT_BILL_1.workOrder, id: options.workOrder.id },
              financial,
            });
          return undefined;
      }
    });
    holder.current = api;
    return api.restore;
  };
  return { beforeEach, holder };
}

/** The body of the last POST to `path`. */
export function posted(api: WorkOrderStoryApi | null, path: string): unknown {
  return api?.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path)
    .at(-1)?.body;
}
