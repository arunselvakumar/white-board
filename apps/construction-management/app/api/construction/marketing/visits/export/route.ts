import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  visitsWorkbook,
  XLSX_CONTENT_TYPE,
} from "@/src/marketing/infrastructure/marketing-workbooks";

import { VISITS_MENU, visitHandlers as handlers } from "../handlers";
import { ExportConstructionMarketingVisitsRequestModel } from "../visit-models";

export const dynamic = "force-dynamic";

/**
 * The Visits list as an Excel sheet, with the list's filters (date range,
 * visitor, Prospect Company, status with Missed, purpose, interest),
 * newest first. Without View all, only the Visits the caller created or
 * went on (ADR CM-0040 §5). Needs Visits read and export.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, VISITS_MENU, "export");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ExportConstructionMarketingVisitsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const { items, timeZone } = await handlers.exportRows(session.access, {
      from: model.from,
      to: model.to,
      memberId: model.memberId,
      prospectCompanyId: model.prospectCompanyId,
      statuses: model.status,
      purposes: model.purpose,
      interests: model.interest,
    });
    return new Response(await visitsWorkbook(items, timeZone), {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition": 'attachment; filename="visits.xlsx"',
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
