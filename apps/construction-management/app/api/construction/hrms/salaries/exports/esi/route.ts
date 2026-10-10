import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { XLSX_CONTENT_TYPE } from "@/src/hrms/infrastructure/holiday-workbook";
import { esiReturnWorkbook } from "@/src/hrms/infrastructure/statutory-return-workbook";

import { queryOf } from "../../salary-route";
import { statutoryReturns } from "../statutory-export-route";
import { GetConstructionHrmsEsiReturnQueryModel } from "../statutory-export-models";

export const dynamic = "force-dynamic";

/**
 * The ESIC monthly contribution workbook of an approved salary month
 * (CM-320, `hrms.salaries` export and financial): the upload sheet in the
 * ESIC template's columns, the contributions with totals, and the ESI
 * members without an IP number. 409 `SALARY_MONTH_NOT_APPROVED` while any
 * salary of the month is still Calculated.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      GetConstructionHrmsEsiReturnQueryModel.safeParse(queryOf(request)),
    );
    const session = await requireAccess(request, "hrms.salaries", "export");
    if (isResponse(session)) return session;
    const result = await statutoryReturns.esiReturn(
      session.access,
      query.month,
    );
    return new Response(await esiReturnWorkbook(result), {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition": `attachment; filename="esi-contribution-${result.month}.xlsx"`,
        "cache-control": "no-store",
        "x-esi-missing-ip-number": String(result.esi.missingIpNumber.length),
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
