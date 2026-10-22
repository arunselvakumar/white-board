import { mockApi, type ApiCall } from "../../../.storybook/mocks/api";
import type {
  ClientBill,
  ClientBillPage,
  ClientContract,
} from "@/src/queries/contracts-client-bills";

import { CONTRACT, FORM_OPTIONS, pageOf } from "./client-bill-fixtures";

export const CLIENT_BILLS_API = "/api/construction/contracts/client-bills";

export type ClientBillStoryApi = ReturnType<typeof mockApi>;

/**
 * The Client Bill reads for stories (CM-1107), with `write` answering every
 * POST (by default the bill as it was, or the terms). Returns the spy (as
 * `holder.current`) and the restore for `beforeEach`.
 */
export function serveClientBills(
  options: {
    page?: ClientBillPage;
    bill?: ClientBill;
    contract?: ClientContract;
    write?: (call: ApiCall) => Response | undefined;
  } = {},
) {
  const holder: { current: ClientBillStoryApi | null } = { current: null };
  const beforeEach = () => {
    const api = mockApi((call) => {
      const url = new URL(call.path, "http://storybook.local");
      if (call.method === "POST")
        return (
          options.write?.(call) ??
          (url.pathname === `${CLIENT_BILLS_API}/contract/update`
            ? Response.json(options.contract ?? CONTRACT)
            : Response.json(options.bill ?? null, { status: 200 }))
        );
      switch (url.pathname) {
        case CLIENT_BILLS_API: {
          const page = options.page ?? pageOf();
          const status = url.searchParams.get("status");
          if (status == null) return Response.json(page);
          const items = page.items.filter((item) => item.status === status);
          return Response.json({ ...page, items, total: items.length });
        }
        case `${CLIENT_BILLS_API}/form-options`:
          return Response.json(FORM_OPTIONS);
        case `${CLIENT_BILLS_API}/contract`:
          return Response.json(options.contract ?? CONTRACT);
        default:
          if (
            options.bill != null &&
            url.pathname === `${CLIENT_BILLS_API}/${options.bill.id}`
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
export function posted(api: ClientBillStoryApi | null, path: string): unknown {
  return api?.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path)
    .at(-1)?.body;
}
