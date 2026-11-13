import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { companyImportTemplate } from "@/src/marketing/infrastructure/company-import-workbook";
import { XLSX_CONTENT_TYPE } from "@/src/marketing/infrastructure/marketing-workbooks";

import { COMPANIES_MENU } from "../handlers";

export const dynamic = "force-dynamic";

/**
 * The Excel template for the Prospect Company import: Name, City, Phone,
 * Primary Contact name and Primary Contact mobile, with one example row.
 * Needs Companies import.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, COMPANIES_MENU, "import");
    if (isResponse(session)) return session;
    return new Response(await companyImportTemplate(), {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition":
          'attachment; filename="prospect-companies-import.xlsx"',
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
