import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { renderMaterialRequestPdf } from "@/src/procurement/infrastructure/material-request-pdf";

import { requireRequestAccess } from "../../material-request-access";
import { ConstructionProcurementMaterialRequestParamsModel } from "../../material-request-models";

export const dynamic = "force-dynamic";

/** Export Material Request: the request as a PDF (print; on its Project or Central store read). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionProcurementMaterialRequestParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireRequestAccess(request, id, "print", "any");
    if (isResponse(session)) return session;
    const profile = await prisma.constructionOrganizationCompanyProfile.findUnique({
      where: { workspaceId: session.workspaceId },
      select: { name: true, timezone: true },
    });
    const generatedAt = new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: profile?.timezone ?? "Asia/Kolkata",
    }).format(new Date());
    const bytes = await renderMaterialRequestPdf({
      company: profile?.name ?? "",
      request: session.request,
      generatedAt,
    });
    const filename = `${session.request.number.replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`;
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
