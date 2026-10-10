import { queryOptions } from "@tanstack/react-query";

import type {
  ConstructionMastersMaterialOptionModel,
  ListConstructionMastersMaterialOptionsResponseModel,
} from "@/app/api/construction/masters/materials/options/material-option-models";

import { apiJson } from "./http";

export type MaterialOption = ConstructionMastersMaterialOptionModel;

export const MATERIAL_OPTIONS_API =
  "/api/construction/masters/materials/options";

/** Every material-option key starts here; CM-501 invalidates it on writes. */
export const MATERIAL_OPTIONS_KEY = ["masters", "material-options"] as const;

export type MaterialOptionsFilter = {
  search?: string;
  categoryId?: string | null;
  ids?: readonly string[];
};

export function materialOptionsQuery(filter: MaterialOptionsFilter = {}) {
  const query = new URLSearchParams();
  if (filter.search != null && filter.search !== "")
    query.set("search", filter.search);
  if (filter.categoryId != null) query.set("categoryId", filter.categoryId);
  if (filter.ids != null && filter.ids.length > 0)
    query.set("ids", filter.ids.join(","));
  const search = query.toString();
  return queryOptions({
    queryKey: [...MATERIAL_OPTIONS_KEY, search] as const,
    queryFn: async () =>
      (
        await apiJson<ListConstructionMastersMaterialOptionsResponseModel>(
          `${MATERIAL_OPTIONS_API}${search === "" ? "" : `?${search}`}`,
        )
      ).items,
  });
}
