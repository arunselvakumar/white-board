import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  XLSX_CONTENT_TYPE,
  labourExport,
} from "@/src/labour/infrastructure/labour-workbook";
import { can } from "@/src/shared-kernel/access";

import { labour } from "../handlers";
import {
  ExportConstructionLabourLaboursRequestModel,
  queryBoolean,
} from "../labour-models";

export const dynamic = "force-dynamic";

/**
 * The filtered register as an Excel sheet (CM-206), with the import's
 * columns plus Status and Balance. Amounts only with `financial`; Aadhaar
 * masked.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "masters.labours", "read");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ExportConstructionLabourLaboursRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const items = await labour.labours.all({
      workspaceId: session.workspaceId,
      projectId: model.projectId,
      active: queryBoolean(model.active),
      search: model.q,
      supervisorId: model.supervisorId,
      labourCategoryId: model.categoryId,
    });
    const bytes = await labourExport(
      items,
      can(session.access, "masters.labours", "financial"),
    );
    return new Response(bytes, {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition": 'attachment; filename="labours.xlsx"',
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
