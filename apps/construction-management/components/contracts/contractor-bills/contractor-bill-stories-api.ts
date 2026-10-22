import { mockApi, type ApiCall } from "../../../.storybook/mocks/api";
import type {
  ContractorBill,
  ContractorBillPage,
} from "@/src/queries/contracts-contractor-bills";

import { FORM_OPTIONS, pageOf } from "./contractor-bill-fixtures";

export const CONTRACTOR_BILLS_API =
  "/api/construction/contracts/contractor-bills";

export type ContractorBillStoryApi = ReturnType<typeof mockApi>;

/**
 * The Contractor Bill reads for stories (CM-1106), with `write` answering
 * every POST (by default the bill as it was). Returns the spy (as
 * `holder.current`) and the restore for `beforeEach`.
 */
export function serveContractorBills(
  options: {
    page?: ContractorBillPage;
    bill?: ContractorBill;
    write?: (call: ApiCall) => Response | undefined;
  } = {},
) {
  const holder: { current: ContractorBillStoryApi | null } = { current: null };
  const beforeEach = () => {
    const api = mockApi((call) => {
      const url = new URL(call.path, "http://storybook.local");
      if (call.method === "POST")
        return (
          options.write?.(call) ??
          Response.json(options.bill ?? null, { status: 200 })
        );
      switch (url.pathname) {
        case CONTRACTOR_BILLS_API: {
          const page = options.page ?? pageOf();
          const status = url.searchParams.get("status");
          if (status == null) return Response.json(page);
          const items = page.items.filter((item) => item.status === status);
          return Response.json({ ...page, items, total: items.length });
        }
        case `${CONTRACTOR_BILLS_API}/form-options`:
          return Response.json(FORM_OPTIONS);
        default:
          if (
            options.bill != null &&
            url.pathname === `${CONTRACTOR_BILLS_API}/${options.bill.id}`
          )
            return Response.json(options.bill);
          return undefined;
      }
    });
    holder.current = api;
    return api.restore;
  };
  return { beforeEach, holder };
}

/** The body of the last POST to `path`. */
export function posted(
  api: ContractorBillStoryApi | null,
  path: string,
): unknown {
  return api?.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path)
    .at(-1)?.body;
}
