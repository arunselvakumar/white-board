import { queryOptions } from "@tanstack/react-query";

import type {
  ConstructionHrmsHolidayResponseModel,
  CreateConstructionHrmsHolidayRequestModel,
  ImportConstructionHrmsHolidaysResponseModel,
  ListConstructionHrmsHolidaysResponseModel,
  UpdateConstructionHrmsHolidayRequestModel,
} from "@/app/api/construction/hrms/holidays/holiday-models";

import { HRMS_KEY } from "./hrms-settings";
import { apiJson, QueryHttpError } from "./http";

const HOLIDAYS = "/api/construction/hrms/holidays";
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const HRMS_HOLIDAYS_KEY = [...HRMS_KEY, "holidays"] as const;

export type HrmsHoliday = ConstructionHrmsHolidayResponseModel;
export type HrmsHolidayImportPreview =
  ImportConstructionHrmsHolidaysResponseModel;

/** The Company's holidays in a year (CM-305). */
export function hrmsHolidaysQuery(year: number) {
  return queryOptions({
    queryKey: [...HRMS_HOLIDAYS_KEY, year],
    queryFn: () =>
      apiJson<ListConstructionHrmsHolidaysResponseModel>(
        `${HOLIDAYS}?year=${String(year)}`,
      ),
  });
}

/** The sample sheet's address, with example rows for `year`. */
export function hrmsHolidaySampleUrl(year: number): string {
  return `${HOLIDAYS}/sample?year=${String(year)}`;
}

function post<T>(url: string, body: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function createHrmsHoliday(
  input: CreateConstructionHrmsHolidayRequestModel,
): Promise<HrmsHoliday> {
  return post(HOLIDAYS, input);
}

export function updateHrmsHoliday(
  id: string,
  input: UpdateConstructionHrmsHolidayRequestModel,
): Promise<HrmsHoliday> {
  return post(`${HOLIDAYS}/${id}/update`, input);
}

export function deleteHrmsHoliday(id: string): Promise<void> {
  return post(`${HOLIDAYS}/${id}/delete`, {});
}

/**
 * Uploads the filled sheet: a preview (`dryRun`), or the import. A refused
 * import (`IMPORT_HAS_ERRORS`) answers its preview, as the labour import.
 */
export async function importHrmsHolidays(
  file: Blob,
  dryRun: boolean,
): Promise<HrmsHolidayImportPreview> {
  try {
    return await apiJson<HrmsHolidayImportPreview>(
      `${HOLIDAYS}/import?dryRun=${String(dryRun)}`,
      { method: "POST", headers: { "content-type": XLSX }, body: file },
    );
  } catch (error) {
    if (
      error instanceof QueryHttpError &&
      error.code === "IMPORT_HAS_ERRORS" &&
      error.details != null &&
      typeof error.details === "object"
    )
      return { ...(error.details as HrmsHolidayImportPreview), imported: 0 };
    throw error;
  }
}
