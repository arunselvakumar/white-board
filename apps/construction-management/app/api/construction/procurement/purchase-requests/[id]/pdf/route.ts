import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  readCompanyHeader,
  renderPurchaseRequestPdf,
} from "@/src/procurement/infrastructure/purchase-request-pdf";

import {
  pdfFileName,
  projectName,
  purchaseRequestHandlers as handlers,
  requirePurchaseRequestAccess,
  siteLocationLabel,
} from "../../handlers";
import {
  ConstructionProcurementPurchaseRequestParamsModel,
  GetConstructionProcurementPurchaseRequestPdfRequestModel,
} from "../../purchase-request-models";

export const dynamic = "force-dynamic";

/**
 * The Purchase Request as a PDF (CM-503): Company header, details,
 * materials and remarks, in Noto fonts so names in Indian scripts print.
 * Needs Purchase Request print on its Project; `inline=1` opens it.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionProcurementPurchaseRequestParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requirePurchaseRequestAccess(request, id, "print");
    if (isResponse(session)) return session;
    const query = parseOrThrow(
      GetConstructionProcurementPurchaseRequestPdfRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const pr = await handlers.get(session.workspaceId, id);
    const [company, project, location] = await Promise.all([
      readCompanyHeader(prisma, session.workspaceId),
      projectName(session.workspaceId, pr.projectId),
      siteLocationLabel(session.workspaceId, pr.projectId, pr.siteLocation),
    ]);
    const pdf = await renderPurchaseRequestPdf({
      company,
      projectName: project,
      locationLabel: location,
      request: pr,
    });
    const disposition = query.inline === "1" ? "inline" : "attachment";
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${disposition}; filename="${pdfFileName(pr.number)}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
