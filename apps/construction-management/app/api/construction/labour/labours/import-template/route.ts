import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  XLSX_CONTENT_TYPE,
  labourTemplate,
} from "@/src/labour/infrastructure/labour-workbook";

import { labour } from "../handlers";

export const dynamic = "force-dynamic";

/**
 * The sample Excel sheet for the labour import (CM-206): headers, one
 * example row, and a Lists sheet with the Company's Projects, Labour
 * Categories and Supervisors.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "masters.labours", "read");
    if (isResponse(session)) return session;
    const lookups = await labour.lookups.all(session.workspaceId);
    const bytes = await labourTemplate({
      projects: lookups.projects.map((item) => item.name),
      labourCategories: lookups.labourCategories
        .filter((item) => !item.disabled)
        .map((item) => item.name),
      supervisors: lookups.supervisors
        .filter((item) => !item.disabled)
        .map((item) => item.name),
    });
    return new Response(bytes, {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition":
          'attachment; filename="labour-import-sample.xlsx"',
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
