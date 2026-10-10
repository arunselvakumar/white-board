import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionMastersMaterialCategoryResponseModel,
  CreateConstructionMastersMaterialCategoryRequestModel,
  ListConstructionMastersMaterialCategoriesResponseModel,
  UpdateConstructionMastersMaterialCategoryRequestModel,
} from "@/app/api/construction/masters/material-categories/material-category-models";
import type {
  ConstructionMastersMaterialResponseModel,
  CreateConstructionMastersMaterialRequestModel,
  ListConstructionMastersMaterialsResponseModel,
  UpdateConstructionMastersMaterialRequestModel,
} from "@/app/api/construction/masters/materials/material-models";
import type {
  ConstructionMastersMeasurementUnitResponseModel,
  ListConstructionMastersMeasurementUnitsResponseModel,
} from "@/app/api/construction/masters/measurement-units/measurement-unit-models";
import type {
  ConstructionMastersTermsConditionResponseModel,
  ListConstructionMastersTermsConditionsResponseModel,
} from "@/app/api/construction/masters/terms-conditions/terms-condition-models";

import { apiJson } from "./http";
import { MATERIAL_OPTIONS_KEY } from "./material-options";

const BASE = "/api/construction/masters";

/** The procurement masters' lists (CM-501), by their API path segment. */
export type MaterialMasterList =
  | "measurement-units"
  | "material-categories"
  | "materials"
  | "terms-conditions";

export type MeasurementUnitItem =
  ConstructionMastersMeasurementUnitResponseModel;
export type MaterialCategoryItem =
  ConstructionMastersMaterialCategoryResponseModel;
export type MaterialItem = ConstructionMastersMaterialResponseModel;
export type TermsConditionItem = ConstructionMastersTermsConditionResponseModel;

export type MaterialInput = CreateConstructionMastersMaterialRequestModel;
export type MaterialUpdateInput = UpdateConstructionMastersMaterialRequestModel;
export type MaterialCategoryInput =
  CreateConstructionMastersMaterialCategoryRequestModel;
export type MaterialCategoryUpdateInput =
  UpdateConstructionMastersMaterialCategoryRequestModel;

type Pages = {
  "measurement-units": ListConstructionMastersMeasurementUnitsResponseModel;
  "material-categories": ListConstructionMastersMaterialCategoriesResponseModel;
  materials: ListConstructionMastersMaterialsResponseModel;
  "terms-conditions": ListConstructionMastersTermsConditionsResponseModel;
};

export type MaterialMasterPage<L extends MaterialMasterList> = Pages[L];
export type MaterialMasterItem<L extends MaterialMasterList> =
  Pages[L]["items"][number];

/** Every procurement master key starts here (under the masters key). */
export const MATERIAL_MASTERS_KEY = ["masters", "material-masters"] as const;

export type MaterialMasterFilter = {
  search: string;
  status: "all" | "enabled" | "disabled";
  cursor: { after: string } | { before: string } | null;
  /** Extra list filters: `categoryId`, `itemType`, `topLevel`, `parentId`. */
  extra?: Record<string, string | undefined>;
  limit?: number;
};

export function materialMasterListQuery<L extends MaterialMasterList>(
  list: L,
  filter: MaterialMasterFilter,
) {
  const params = new URLSearchParams({ limit: String(filter.limit ?? 25) });
  if (filter.search.trim() !== "") params.set("q", filter.search.trim());
  if (filter.status !== "all") params.set("status", filter.status);
  for (const [key, value] of Object.entries(filter.extra ?? {}))
    if (value != null && value !== "") params.set(key, value);
  if (filter.cursor != null) {
    if ("after" in filter.cursor) params.set("after", filter.cursor.after);
    else params.set("before", filter.cursor.before);
  }
  return queryOptions({
    queryKey: [...MATERIAL_MASTERS_KEY, list, "list", params.toString()],
    queryFn: () =>
      apiJson<MaterialMasterPage<L>>(`${BASE}/${list}?${params.toString()}`),
  });
}

export function materialMasterQuery<L extends MaterialMasterList>(
  list: L,
  id: string,
) {
  return queryOptions({
    queryKey: [...MATERIAL_MASTERS_KEY, list, "detail", id],
    queryFn: () =>
      apiJson<MaterialMasterItem<L>>(
        `${BASE}/${list}/${encodeURIComponent(id)}`,
      ),
  });
}

/** Enabled units for pickers, by name (the Company has 41 seeds and a few of its own). */
export const unitOptionsQuery = queryOptions({
  queryKey: [...MATERIAL_MASTERS_KEY, "measurement-units", "options"],
  queryFn: async () => {
    const page = await apiJson<MaterialMasterPage<"measurement-units">>(
      `${BASE}/measurement-units?status=enabled&limit=100`,
    );
    return [...page.items].sort((a, b) => byName.compare(a.name, b.name));
  },
});

/** Enabled categories for pickers, each under its parent ("Civil › Cement"). */
export function categoryOptionsQuery(options: { topLevel?: boolean } = {}) {
  return queryOptions({
    queryKey: [
      ...MATERIAL_MASTERS_KEY,
      "material-categories",
      "options",
      options.topLevel === true ? "top" : "all",
    ],
    queryFn: async () => {
      const page = await apiJson<MaterialMasterPage<"material-categories">>(
        `${BASE}/material-categories?status=enabled&limit=100${options.topLevel === true ? "&topLevel=true" : ""}`,
      );
      return [...page.items].sort((a, b) =>
        byName.compare(categoryPath(a), categoryPath(b)),
      );
    },
  });
}

export const byName = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});

/** "Civil Work Materials › Cement", or the name of a top-level category. */
export function categoryPath(category: {
  name: string;
  parentName: string | null;
}): string {
  return category.parentName == null
    ? category.name
    : `${category.parentName} › ${category.name}`;
}

function postJson<T>(url: string, body?: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export type MaterialMasterCommand =
  | { kind: "create"; input: unknown }
  | { kind: "update"; id: string; input: unknown }
  | { kind: "disable" | "enable" | "delete"; id: string };

export function runMaterialMasterCommand<T>(
  list: MaterialMasterList,
  command: MaterialMasterCommand,
): Promise<T | undefined> {
  switch (command.kind) {
    case "create":
      return postJson<T>(`${BASE}/${list}`, command.input);
    case "update":
      return postJson<T>(
        `${BASE}/${list}/${encodeURIComponent(command.id)}/update`,
        command.input,
      );
    default:
      return postJson<T>(
        `${BASE}/${list}/${encodeURIComponent(command.id)}/${command.kind}`,
      );
  }
}

/**
 * Add, update, disable, enable and delete on a procurement master list.
 * Every write also refreshes the material picker (`MATERIAL_OPTIONS_KEY`),
 * whose rows show units and categories by name.
 */
export function useMaterialMasterCommand<L extends MaterialMasterList>(
  list: L,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: MaterialMasterCommand) =>
      runMaterialMasterCommand<MaterialMasterItem<L>>(list, command),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: MATERIAL_MASTERS_KEY }),
        queryClient.invalidateQueries({ queryKey: MATERIAL_OPTIONS_KEY }),
      ]);
    },
  });
}

/** Adds a Material (the master form, or the picker's Create New). */
export function useCreateMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MaterialInput) =>
      postJson<MaterialItem>(`${BASE}/materials`, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: MATERIAL_MASTERS_KEY }),
        queryClient.invalidateQueries({ queryKey: MATERIAL_OPTIONS_KEY }),
      ]);
    },
  });
}

export function useUpdateMaterial(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MaterialUpdateInput) =>
      postJson<MaterialItem>(
        `${BASE}/materials/${encodeURIComponent(id)}/update`,
        input,
      ),
    onSuccess: async (updated) => {
      queryClient.setQueryData(
        materialMasterQuery("materials", id).queryKey,
        updated,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: MATERIAL_MASTERS_KEY }),
        queryClient.invalidateQueries({ queryKey: MATERIAL_OPTIONS_KEY }),
      ]);
    },
  });
}
