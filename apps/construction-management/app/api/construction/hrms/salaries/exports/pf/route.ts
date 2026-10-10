import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { ecrText } from "@/src/hrms/domain/statutory-returns";
import { XLSX_CONTENT_TYPE } from "@/src/hrms/infrastructure/holiday-workbook";
import { pfReturnWorkbook } from "@/src/hrms/infrastructure/statutory-return-workbook";

import { queryOf } from "../../salary-route";
import { statutoryReturns } from "../statutory-export-route";
import { GetConstructionHrmsPfReturnQueryModel } from "../statutory-export-models";

export const dynamic = "force-dynamic";

/**
 * The PF ECR of an approved salary month (CM-320, `hrms.salaries` export
 * and financial): the EPFO upload text file, or Excel with totals and the
 * PF members without a UAN. 409 `SALARY_MONTH_NOT_APPROVED` while any
 * salary of the month is still Calculated. The text file carries only
 * members with a UAN; `x-ecr-missing-uan` counts the others.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      GetConstructionHrmsPfReturnQueryModel.safeParse(queryOf(request)),
    );
    const session = await requireAccess(request, "hrms.salaries", "export");
    if (isResponse(session)) return session;
    const result = await statutoryReturns.pfReturn(session.access, query.month);
    const missing = String(result.ecr.missingUan.length);
    if (query.format === "xlsx")
      return new Response(await pfReturnWorkbook(result), {
        headers: {
          "content-type": XLSX_CONTENT_TYPE,
          "content-disposition": `attachment; filename="pf-ecr-${result.month}.xlsx"`,
          "cache-control": "no-store",
          "x-ecr-missing-uan": missing,
        },
      });
    return new Response(ecrText(result.ecr), {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="pf-ecr-${result.month}.txt"`,
        "cache-control": "no-store",
        "x-ecr-missing-uan": missing,
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
