import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { contentDisposition } from "@/app/api/_lib/uploads";
import {
  boqImportSample,
  XLSX_CONTENT_TYPE,
} from "@/src/contracts/infrastructure/boq-workbook";

import {
  boqHandlers,
  requestProjectId,
  requireBoqProjectAccess,
} from "../boq-access";

export const dynamic = "force-dynamic";

/**
 * The BOQ import sample (CM-1103): one sheet with the columns Section,
 * Item no, Description, UoM, SAC/HSN, Quantity, Rate (₹), Wing / Location
 * and Library code, and example rows. Needs BOQ Import and Financial on
 * the Project (the sheet carries rates).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const projectId = requestProjectId(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const session = await requireBoqProjectAccess(request, "import", projectId);
    if (isResponse(session)) return session;
    boqHandlers.assertCanImport(session.access, projectId);
    return new Response(await boqImportSample(), {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition": contentDisposition(
          "attachment",
          "boq-sample.xlsx",
        ),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
