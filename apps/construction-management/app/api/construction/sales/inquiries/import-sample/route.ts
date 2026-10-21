import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { contentDisposition } from "@/app/api/_lib/uploads";
import { requireSalesProjectAccess } from "@/app/api/construction/sales/sales-access";
import {
  inquiryImportSample,
  XLSX_CONTENT_TYPE,
} from "@/src/sales/infrastructure/inquiry-workbook";

import { INQUIRY_MENU, inquiryHandlers as handlers } from "../handlers";
import { GetConstructionSalesInquiryImportSampleRequestModel } from "../inquiry-models";

export const dynamic = "force-dynamic";

/**
 * The inquiry import sample (CM-1007): the headers, and a Lists sheet with
 * the Project's live Lead Sources, Funnel Stages, Wings and Team Members.
 * Needs Inquiry create on the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      GetConstructionSalesInquiryImportSampleRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireSalesProjectAccess(
      request,
      INQUIRY_MENU,
      "create",
      query.projectId,
    );
    if (isResponse(session)) return session;
    const lists = await handlers.importLists(session.access, query.projectId);
    return new Response(await inquiryImportSample(lists), {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition": contentDisposition(
          "attachment",
          "inquiries-import-sample.xlsx",
        ),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
