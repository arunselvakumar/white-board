import { mockApi, type ApiCall } from "../../../.storybook/mocks/api";
import type {
  MeasurementPage,
  MeasurementSheet,
} from "@/src/queries/contracts-measurements";

import {
  FORM_OPTIONS,
  NO_PHOTOS,
  pageOf,
  PROJECT,
  quantitiesOf,
} from "./measurement-fixtures";

export const MEASUREMENTS_API = "/api/construction/contracts/measurements";

export const PUMP_HOUSE = "0199c0de-1105-7000-8000-0000000000e1";

export type MeasurementStoryApi = ReturnType<typeof mockApi>;

/**
 * The Measurement Book reads for stories (CM-1105), with `write` answering
 * every POST (by default the sheet as it was). `checked` is what checked
 * sheets measured per item, for the live cumulative panel. Returns the spy
 * (as `holder.current`) and the restore for `beforeEach`.
 */
export function serveMeasurements(
  options: {
    page?: MeasurementPage;
    sheet?: MeasurementSheet;
    checked?: Record<string, string>;
    canUpload?: boolean;
    write?: (call: ApiCall) => Response | undefined;
  } = {},
) {
  const holder: { current: MeasurementStoryApi | null } = { current: null };
  const beforeEach = () => {
    const api = mockApi((call) => {
      const url = new URL(call.path, "http://storybook.local");
      if (call.method === "POST")
        return (
          options.write?.(call) ??
          Response.json(options.sheet ?? null, { status: 200 })
        );
      switch (url.pathname) {
        case MEASUREMENTS_API: {
          const page = options.page ?? pageOf();
          const keep = (item: MeasurementPage["items"][number]) =>
            ["side", "status", "workOrderId"].every((name) => {
              const wanted = url.searchParams.get(name);
              return (
                wanted == null ||
                item[name as "side" | "status" | "workOrderId"] === wanted
              );
            });
          const items = page.items.filter(keep);
          return Response.json({ ...page, items, total: items.length });
        }
        case `${MEASUREMENTS_API}/form-options`:
          return Response.json(FORM_OPTIONS);
        case `${MEASUREMENTS_API}/quantities`:
          // As the API answers: the contractor side needs its Work Order.
          if (
            url.searchParams.get("side") === "contractor" &&
            url.searchParams.get("workOrderId") == null
          )
            return Response.json(
              {
                code: "MEASUREMENT_WORK_ORDER_REQUIRED",
                message: "Pick the Work Order measured.",
              },
              { status: 400 },
            );
          return Response.json(
            quantitiesOf(
              url.searchParams.get("side") === "contractor"
                ? "contractor"
                : "client",
              options.checked,
            ),
          );
        case `/api/construction/projects/projects/${PROJECT}/location-options`:
          return Response.json({
            structure: "locations",
            types: ["location"],
            wings: [],
            amenities: [],
            commonDevelopments: [],
            locations: [{ id: PUMP_HOUSE, name: "Pump house" }],
          });
        default:
          if (
            options.sheet != null &&
            url.pathname === `${MEASUREMENTS_API}/${options.sheet.id}`
          )
            return Response.json(options.sheet);
          if (url.pathname.endsWith("/photos"))
            return Response.json({
              ...NO_PHOTOS,
              canUpload: options.canUpload ?? true,
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
export function posted(api: MeasurementStoryApi | null, path: string): unknown {
  return api?.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path)
    .at(-1)?.body;
}

/** A 375 px phone for the stories that check the row cards. */
export const PHONE_375 = {
  parameters: {
    viewport: {
      options: {
        phone375: {
          name: "Phone 375",
          styles: { width: "375px", height: "812px" },
          type: "mobile",
        },
      },
    },
  },
  globals: { viewport: { value: "phone375", isRotated: false } },
} as const;

/** Every request so far to `pathname` (any query). */
export function requested(
  api: MeasurementStoryApi | null,
  pathname: string,
): string[] {
  return (api?.calls.mock.calls ?? [])
    .map(([call]) => call.path)
    .filter((path) => path.split("?")[0] === pathname);
}
