import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  companiesWorkbook,
  XLSX_CONTENT_TYPE,
} from "@/src/marketing/infrastructure/marketing-workbooks";

import { ExportConstructionMarketingProspectCompaniesRequestModel } from "../company-models";
import {
  COMPANIES_MENU,
  prospectCompanyHandlers as handlers,
} from "../handlers";

export const dynamic = "force-dynamic";

/**
 * The Prospect Companies list as an Excel sheet, A–Z, with the list's
 * search and filters (Stage, assigned person, industry) and the primary
 * Contact's mobile. Without View all, only the companies the caller
 * created or is assigned (ADR CM-0040 §5). Needs Companies read and
 * export.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, COMPANIES_MENU, "export");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ExportConstructionMarketingProspectCompaniesRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const { items, timeZone } = await handlers.exportRows(session.access, {
      search: model.search,
      stages: model.stage,
      assignedMemberId: model.assignedMemberId,
      industry: model.industry,
    });
    return new Response(await companiesWorkbook(items, timeZone), {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition": 'attachment; filename="prospect-companies.xlsx"',
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
