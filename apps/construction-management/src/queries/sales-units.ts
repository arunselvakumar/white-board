import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type {
  ConstructionSalesUnitChartResponse,
  ConstructionSalesUnitResponse,
  MarkConstructionSalesUnitUnavailableRequestModel,
  SetConstructionSalesUnitDetailsRequestModel,
} from "@/app/api/construction/sales/units/unit-models";

import { apiJson } from "./http";
import { SALES_API, SALES_KEY } from "./sales-access";

export type UnitChart = ConstructionSalesUnitChartResponse;
export type SalesUnit = ConstructionSalesUnitResponse;
export type UnitImportRowError = {
  row: number;
  field: string;
  message: string;
};

export const UNITS_API = `${SALES_API}/units`;
/** Every Units read (CM-1005); unit and booking writes invalidate it. */
export const UNITS_KEY = [...SALES_KEY, "units"] as const;
/** Bookings reads (CM-1006): a unit's status shows there too. */
const BOOKINGS_KEY = [...SALES_KEY, "bookings"] as const;

/** The Bookings module's tabs (ADR CM-0020: in the sidebar). */
export const BOOKINGS_TABS = [
  { segment: "units", label: "Units" },
  { segment: "list", label: "Bookings" },
] as const;
export type BookingsTabSegment = (typeof BOOKINGS_TABS)[number]["segment"];

export function bookingsModulePath(
  projectId: string,
  segment: BookingsTabSegment,
): string {
  return `/app/projects/${encodeURIComponent(projectId)}/bookings/${segment}`;
}

/** The Units chart: every Wing's counts and one Wing's floors × units. */
export function unitChartQuery(projectId: string, wingId?: string | null) {
  const params = new URLSearchParams({ projectId });
  if (wingId != null && wingId !== "") params.set("wingId", wingId);
  return queryOptions({
    queryKey: [...UNITS_KEY, "chart", projectId, wingId ?? ""] as const,
    queryFn: () => apiJson<UnitChart>(`${UNITS_API}?${params}`),
  });
}

/** One unit's sales details and bookings, for the unit panel. */
export function salesUnitQuery(projectId: string, unitId: string) {
  return queryOptions({
    queryKey: [...UNITS_KEY, "unit", unitId] as const,
    queryFn: () =>
      apiJson<SalesUnit>(
        `${UNITS_API}/${encodeURIComponent(unitId)}?projectId=${encodeURIComponent(projectId)}`,
      ),
  });
}

function useInvalidate() {
  const client = useQueryClient();
  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: UNITS_KEY }),
      client.invalidateQueries({ queryKey: BOOKINGS_KEY }),
    ]);
  };
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(`${UNITS_API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export type UnitDetailsInput = Omit<
  z.input<typeof SetConstructionSalesUnitDetailsRequestModel>,
  "projectId" | "expectedUpdatedAt"
>;
export type UnitUnavailableInput = Omit<
  z.input<typeof MarkConstructionSalesUnitUnavailableRequestModel>,
  "projectId" | "expectedUpdatedAt"
>;

/** Unit type and areas; Unavailable with a reason; available again. */
export function useUnitCommand(projectId: string, unit: SalesUnit) {
  const invalidate = useInvalidate();
  const stale = {
    projectId,
    expectedUpdatedAt: unit.profile.updatedAt,
  };
  const path = (action: string) => `/${encodeURIComponent(unit.id)}/${action}`;
  return useMutation({
    mutationFn: (
      input:
        | { action: "details"; body: UnitDetailsInput }
        | { action: "unavailable"; body: UnitUnavailableInput }
        | { action: "available" },
    ) =>
      post<SalesUnit>(path(input.action), {
        ...stale,
        ...("body" in input ? input.body : {}),
      }),
    onSuccess: invalidate,
  });
}

/** The import sample's download link (filled with the Project's units). */
export function unitSampleUrl(projectId: string): string {
  return `${UNITS_API}/import-sample?projectId=${encodeURIComponent(projectId)}`;
}

/** Uploads the filled sample; every row or none. */
export function useImportUnits(projectId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (file: File) =>
      apiJson<{ updated: number }>(
        `${UNITS_API}/import?projectId=${encodeURIComponent(projectId)}`,
        {
          method: "POST",
          headers: {
            "content-type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
          body: file,
        },
      ),
    onSuccess: invalidate,
  });
}
