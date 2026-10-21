import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { contentDisposition } from "@/app/api/_lib/uploads";
import {
  boqExport,
  XLSX_CONTENT_TYPE,
} from "@/src/contracts/infrastructure/boq-workbook";

import {
  boqHandlers,
  requestProjectId,
  requireBoqProjectAccess,
} from "../boq-access";

export const dynamic = "force-dynamic";

/**
 * The whole BOQ as .xlsx (CM-1103) with original and current quantities
 * and rates and the amounts; it imports back by its Quantity and Rate (₹)
 * columns. Needs BOQ Export and Financial.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const projectId = requestProjectId(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const session = await requireBoqProjectAccess(request, "export", projectId);
    if (isResponse(session)) return session;
    const { project, rows } = await boqHandlers.export(
      session.access,
      projectId,
    );
    return new Response(await boqExport(rows), {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition": contentDisposition(
          "attachment",
          `boq-${
            project.name
              .replace(/[^A-Za-z0-9-]+/g, "-")
              .replace(/^-+|-+$/g, "")
              .toLowerCase() || "project"
          }.xlsx`,
        ),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
