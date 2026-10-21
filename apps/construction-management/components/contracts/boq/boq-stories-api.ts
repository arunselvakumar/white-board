import { mockApi, type ApiCall } from "../../../.storybook/mocks/api";
import {
  boqOf,
  DEVIATIONS,
  FORM_OPTIONS,
  LIBRARY,
  SETTINGS,
  variationPage,
} from "./boq-fixtures";
import type { Boq } from "@/src/queries/contracts-boq";

export const BOQ_API = "/api/construction/contracts/boq";

export type BoqStoryApi = ReturnType<typeof mockApi>;

/**
 * The BOQ's reads for stories (CM-1103), with `write` answering every POST.
 * Returns the spy (as `api.current`) and the restore for `beforeEach`.
 */
export function serveBoq(
  options: {
    boq?: Boq;
    write?: (call: ApiCall) => Response | undefined;
  } = {},
) {
  const holder: { current: BoqStoryApi | null } = { current: null };
  const beforeEach = () => {
    const api = mockApi((call) => {
      const url = new URL(call.path, "http://storybook.local");
      if (call.method === "POST")
        return options.write?.(call) ?? Response.json({}, { status: 200 });
      switch (url.pathname) {
        case BOQ_API:
          return Response.json(options.boq ?? boqOf());
        case `${BOQ_API}/form-options`:
          return Response.json(FORM_OPTIONS);
        case `${BOQ_API}/library-items`: {
          const q = url.searchParams.get("q")?.toLowerCase() ?? "";
          return Response.json({
            items: LIBRARY.filter(
              (item) =>
                item.code.toLowerCase().includes(q) ||
                item.shortDescription.toLowerCase().includes(q),
            ),
          });
        }
        case `${BOQ_API}/variations`: {
          const status = url.searchParams.get("status");
          const page = variationPage();
          return Response.json(
            status == null
              ? page
              : variationPage(page.items.filter((v) => v.status === status)),
          );
        }
        case `${BOQ_API}/deviations`:
          return Response.json(DEVIATIONS);
        case `${BOQ_API}/settings`:
          return Response.json(SETTINGS);
        default:
          return undefined;
      }
    });
    holder.current = api;
    return api.restore;
  };
  return { beforeEach, holder };
}

/** The body of the last POST to `path`. */
export function posted(api: BoqStoryApi | null, path: string): unknown {
  return api?.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path)
    .at(-1)?.body;
}

export function postCount(api: BoqStoryApi | null): number {
  return (
    api?.calls.mock.calls.filter(([call]) => call.method === "POST").length ?? 0
  );
}
