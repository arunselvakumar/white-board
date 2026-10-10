import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { XLSX_CONTENT_TYPE } from "@/src/hrms/infrastructure/holiday-workbook";
import { teamSalaryWorkbook } from "@/src/hrms/infrastructure/salary-workbook";

import { GetConstructionHrmsTeamSalaryReportQueryModel } from "../../salary-models";
import { queryOf, salaryHandlers } from "../../salary-route";

export const dynamic = "force-dynamic";

/**
 * The team salary report (CM-317, `hrms.salaries` report or export): an
 * Excel workbook of the month's slips with totals, the advances paid and
 * the members without a slip. Amounts are blank without financial.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      GetConstructionHrmsTeamSalaryReportQueryModel.safeParse(queryOf(request)),
    );
    const session = await requireAccess(request, "hrms.salaries", "read");
    if (isResponse(session)) return session;
    const report = await salaryHandlers.teamReport(session.access, query.month);
    const bytes = await teamSalaryWorkbook(report);
    return new Response(bytes, {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition": `attachment; filename="team-salary-${report.month}.xlsx"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
