import { fn } from "storybook/test";

import type {
  MaterialCategoryItem,
  MaterialItem,
  MeasurementUnitItem,
  TermsConditionItem,
} from "@/src/queries/material-masters";

/** Story-only fixtures and an in-memory procurement masters API (CM-501). */

const AT = "2026-10-08T06:30:00.000Z";
const LATER = "2026-10-08T07:00:00.000Z";

function uuid(prefix: string, n: number): string {
  return `0199c4a0-0000-7000-8000-${prefix}${String(n).padStart(12 - prefix.length, "0")}`;
}

export function storyUnit(
  n: number,
  name: string,
  extra: Partial<MeasurementUnitItem> = {},
): MeasurementUnitItem {
  return {
    id: uuid("b", n),
    name,
    isSeed: true,
    disabled: false,
    createdAt: AT,
    updatedAt: AT,
    ...extra,
  };
}

export const STORY_UNITS: MeasurementUnitItem[] = [
  storyUnit(1, "Bag"),
  storyUnit(2, "kg"),
  storyUnit(3, "cum"),
  storyUnit(4, "sqft", { disabled: true }),
  storyUnit(5, "Running metre", { isSeed: false }),
];

export function storyCategory(
  n: number,
  name: string,
  extra: Partial<MaterialCategoryItem> = {},
): MaterialCategoryItem {
  return {
    id: uuid("c", n),
    name,
    parentId: null,
    parentName: null,
    childCount: 0,
    isSeed: true,
    disabled: false,
    createdAt: AT,
    updatedAt: AT,
    ...extra,
  };
}

export const STORY_CIVIL = storyCategory(1, "Civil Work Materials", {
  childCount: 1,
});

export const STORY_CATEGORIES: MaterialCategoryItem[] = [
  STORY_CIVIL,
  storyCategory(2, "Colour & Paints"),
  storyCategory(3, "Plumbing Material", { disabled: true }),
  storyCategory(4, "Cement", {
    isSeed: false,
    parentId: uuid("c", 1),
    parentName: "Civil Work Materials",
  }),
];

export function storyMaterial(
  n: number,
  name: string,
  extra: Partial<MaterialItem> = {},
): MaterialItem {
  return {
    id: uuid("a", n),
    name,
    specification: null,
    uomId: uuid("b", 1),
    uomName: "Bag",
    categoryId: uuid("c", 1),
    categoryName: "Civil Work Materials",
    itemType: "consumable",
    unitRate: null,
    discount: null,
    gstRate: null,
    hsnCode: null,
    minStockQty: null,
    disabled: false,
    createdAt: AT,
    updatedAt: AT,
    ...extra,
  };
}

export const STORY_CEMENT = storyMaterial(1, "Cement OPC 53", {
  specification: "UltraTech, 50 kg",
  unitRate: 38_500,
  gstRate: "28.00",
  hsnCode: "2523",
  minStockQty: "50.000",
});

export const STORY_MATERIALS: MaterialItem[] = [
  STORY_CEMENT,
  storyMaterial(2, "TMT Steel Bar 12 mm", {
    uomId: uuid("b", 2),
    uomName: "kg",
    itemType: "consumable",
    unitRate: 6_250,
    discount: { type: "percent", percent: "2.00" },
    gstRate: "18.00",
    hsnCode: "7214",
  }),
  storyMaterial(3, "Concrete Mixer", {
    uomId: uuid("b", 1),
    categoryId: null,
    categoryName: null,
    itemType: "asset",
    disabled: true,
  }),
];

export const STORY_TERMS: TermsConditionItem[] = [
  {
    id: uuid("d", 1),
    title: "Delivery",
    body: "Deliver to site between 9 am and 6 pm.\nUnloading at the supplier's cost.",
    disabled: false,
    createdAt: AT,
    updatedAt: AT,
  },
  {
    id: uuid("d", 2),
    title: "Payment",
    body: "30 days from the Goods Receipt.",
    disabled: false,
    createdAt: AT,
    updatedAt: AT,
  },
];

type Row = { id: string; disabled: boolean; updatedAt: string };

type Lists = {
  units: MeasurementUnitItem[];
  categories: MaterialCategoryItem[];
  materials: MaterialItem[];
  terms: TermsConditionItem[];
};

const BASE = "/api/construction/masters";

const PATHS: Record<keyof Lists, string> = {
  units: `${BASE}/measurement-units`,
  categories: `${BASE}/material-categories`,
  materials: `${BASE}/materials`,
  terms: `${BASE}/terms-conditions`,
};

const CODES: Record<keyof Lists, string> = {
  units: "MEASUREMENT_UNIT",
  categories: "MATERIAL_CATEGORY",
  materials: "MATERIAL",
  terms: "TERMS_CONDITION",
};

function nameOf(row: unknown): string {
  const item = row as { name?: string; title?: string };
  return item.name ?? item.title ?? "";
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function urlOf(input: Parameters<typeof fetch>[0]): URL {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  return new URL(raw, "http://localhost");
}

/**
 * Replaces `fetch` with an in-memory procurement masters API (a story's
 * `beforeEach`; call `restore` after). Lists honour `q`, `status`,
 * `categoryId`, `itemType` and `topLevel`; writes answer the server's 409s
 * for a taken name, a seed row, and rows named in `inUse`.
 */
export function serveMaterialMasters(
  initial: Partial<Lists> = {},
  options: { financial?: boolean; inUse?: string[] } = {},
) {
  const lists: Lists = {
    units: [...(initial.units ?? STORY_UNITS)],
    categories: [...(initial.categories ?? STORY_CATEGORIES)],
    materials: [...(initial.materials ?? STORY_MATERIALS)],
    terms: [...(initial.terms ?? STORY_TERMS)],
  };
  let created = 0;
  const financial = options.financial ?? true;

  function list(kind: keyof Lists, query: URLSearchParams): Response {
    const q = query.get("q")?.toLowerCase() ?? "";
    const status = query.get("status");
    const rows = (lists[kind] as (Row & Record<string, unknown>)[]).filter(
      (row) =>
        (q === "" ||
          nameOf(row).toLowerCase().includes(q) ||
          (typeof row["specification"] === "string" &&
            row["specification"].toLowerCase().includes(q))) &&
        (status == null ||
          status === "all" ||
          row.disabled === (status === "disabled")) &&
        (query.get("categoryId") == null ||
          row["categoryId"] === query.get("categoryId")) &&
        (query.get("itemType") == null ||
          row["itemType"] === query.get("itemType")) &&
        (query.get("topLevel") !== "true" || row["parentId"] == null),
    );
    const limit = Number(query.get("limit") ?? "50");
    return json({
      items: rows.slice(0, limit),
      nextCursor: null,
      prevCursor: null,
      total: rows.length,
      ...(kind === "materials" ? { financial } : {}),
    });
  }

  function names(kind: keyof Lists, id?: string): Set<string> {
    return new Set(
      lists[kind]
        .filter((row) => row.id !== id)
        .map((row) => nameOf(row).toLowerCase()),
    );
  }

  function build(
    kind: keyof Lists,
    body: Record<string, unknown>,
    current: Record<string, unknown> | null,
  ): Record<string, unknown> {
    created += 1;
    const base = current ?? {
      id: `0199c4a0-0000-7000-8000-ffffffff${String(created).padStart(4, "0")}`,
      isSeed: false,
      disabled: false,
      createdAt: LATER,
    };
    if (kind === "categories") {
      const parent = lists.categories.find(
        (row) => row.id === body["parentId"],
      );
      return {
        childCount: 0,
        ...base,
        name: String(body["name"]).trim(),
        parentId: parent?.id ?? null,
        parentName: parent?.name ?? null,
        updatedAt: LATER,
      };
    }
    if (kind === "materials") {
      const unit = lists.units.find((row) => row.id === body["uomId"]);
      const category = lists.categories.find(
        (row) => row.id === body["categoryId"],
      );
      return {
        ...base,
        name: String(body["name"]).trim(),
        specification: body["specification"] ?? null,
        uomId: unit?.id ?? body["uomId"],
        uomName: unit?.name ?? "Unit",
        categoryId: category?.id ?? null,
        categoryName: category?.name ?? null,
        itemType: body["itemType"] ?? "consumable",
        unitRate: financial ? (body["unitRate"] ?? null) : null,
        discount: financial ? (body["discount"] ?? null) : null,
        gstRate: financial ? (body["gstRate"] ?? null) : null,
        hsnCode: financial ? (body["hsnCode"] ?? null) : null,
        minStockQty: body["minStockQty"] ?? null,
        updatedAt: LATER,
      };
    }
    if (kind === "terms")
      return {
        ...base,
        title: body["title"],
        body: body["body"],
        updatedAt: LATER,
      };
    return { ...base, name: String(body["name"]).trim(), updatedAt: LATER };
  }

  const original = globalThis.fetch;
  const spy = fn((...args: Parameters<typeof fetch>) => {
    const [input, init] = args;
    const url = urlOf(input);
    const method = init?.method ?? "GET";
    const text = typeof init?.body === "string" ? init.body : "";
    const body = (text === "" ? {} : JSON.parse(text)) as Record<
      string,
      unknown
    >;
    for (const kind of Object.keys(PATHS) as (keyof Lists)[]) {
      const path = PATHS[kind];
      const code = CODES[kind];
      if (url.pathname === path) {
        if (method === "GET")
          return Promise.resolve(list(kind, url.searchParams));
        if (names(kind).has(nameOf(body).trim().toLowerCase()))
          return Promise.resolve(
            json(
              {
                code: `${code}_NAME_IN_USE`,
                message: "One with this name already exists.",
              },
              409,
            ),
          );
        const row = build(kind, body, null);
        (lists[kind] as unknown[]).unshift(row);
        return Promise.resolve(json(row, 201));
      }
      const match = new RegExp(`^${path}/([^/]+)(?:/(\\w+))?$`).exec(
        url.pathname,
      );
      if (match == null) continue;
      const [, id, action] = match;
      const rows = lists[kind] as unknown as (Row & Record<string, unknown>)[];
      const current = rows.find((row) => row.id === id);
      if (current == null) continue;
      const replace = (next: Record<string, unknown>) => {
        const index = rows.findIndex((row) => row.id === current.id);
        rows[index] = next as Row & Record<string, unknown>;
        return json(next);
      };
      let response: Response;
      switch (action) {
        case undefined:
          response = json(current);
          break;
        case "update":
          response = names(kind, current.id).has(
            nameOf(body).trim().toLowerCase(),
          )
            ? json(
                {
                  code: `${code}_NAME_IN_USE`,
                  message: "One with this name already exists.",
                },
                409,
              )
            : replace(build(kind, body, current));
          break;
        case "disable":
        case "enable":
          response = replace({
            ...current,
            disabled: action === "disable",
            updatedAt: LATER,
          });
          break;
        case "delete":
          if (current["isSeed"] === true)
            response = json(
              { code: "SEED_IS_READ_ONLY", message: "This came with the app." },
              409,
            );
          else if (options.inUse?.includes(nameOf(current)) === true)
            response = json(
              {
                code: `${code}_IN_USE`,
                message:
                  "Materials use this, so it cannot be deleted. Disable it instead.",
              },
              409,
            );
          else {
            rows.splice(rows.indexOf(current), 1);
            response = new Response(null, { status: 204 });
          }
          break;
        default:
          continue;
      }
      return Promise.resolve(response);
    }
    return Promise.resolve(
      json({ code: "NOT_FOUND", message: "Not found." }, 404),
    );
  });
  globalThis.fetch = spy;
  return {
    spy,
    lists,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

type Spy = ReturnType<typeof serveMaterialMasters>["spy"];

/** The JSON body of the last call to a path (and method), if any. */
export function lastBody(spy: Spy, path: string, method = "POST"): unknown {
  const call = [...spy.mock.calls]
    .reverse()
    .find(
      ([input, init]) =>
        urlOf(input).pathname.endsWith(path) &&
        (init?.method ?? "GET") === method,
    );
  const body = call?.[1]?.body;
  return typeof body === "string" ? (JSON.parse(body) as unknown) : undefined;
}

/** Whether a GET went to `path` with these query params. */
export function calledWith(
  spy: Spy,
  path: string,
  params: Record<string, string>,
): boolean {
  return spy.mock.calls.some(([input]) => {
    const url = urlOf(input);
    return (
      url.pathname === path &&
      Object.entries(params).every(
        ([key, value]) => url.searchParams.get(key) === value,
      )
    );
  });
}
