import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { readUpload } from "@/app/api/_lib/uploads";
import { readCompanySheet } from "@/src/marketing/infrastructure/company-import-workbook";

import type { ImportConstructionMarketingProspectCompaniesResponse } from "../company-models";
import {
  COMPANIES_MENU,
  prospectCompanyHandlers as handlers,
} from "../handlers";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Imports Prospect Companies from the template (ADR CM-0040 §11); the
 * body is the .xlsx itself. Each valid row becomes a company at New,
 * assigned to the importer, with its primary Contact. Duplicate names,
 * against a live company or earlier in the sheet, and invalid rows are
 * reported by row, not created. 400 `IMPORT_FILE_INVALID` (not an .xlsx,
 * macros, unpacks too large, no Name header), `IMPORT_EMPTY`,
 * `IMPORT_TOO_MANY` (over 500 rows), `FILE_TOO_LARGE` (over 5 MB). Needs
 * Companies read, create and import.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, COMPANIES_MENU, "import");
    if (isResponse(session)) return session;
    const upload = await readUpload(request, MAX_BYTES);
    const rows = await readCompanySheet(upload.bytes);
    const body: ImportConstructionMarketingProspectCompaniesResponse =
      await handlers.importSheet(session.access, rows);
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
