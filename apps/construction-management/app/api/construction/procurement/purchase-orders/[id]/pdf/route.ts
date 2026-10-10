import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { readSupplierContact } from "@/src/procurement/infrastructure/purchase-order-form-options";
import { renderPurchaseOrderPdf } from "@/src/procurement/infrastructure/purchase-order-pdf";
import { readCompanyHeader } from "@/src/procurement/infrastructure/purchase-request-pdf";

import {
  pdfFileName,
  siteLocationLabel,
} from "../../../purchase-requests/handlers";
import {
  purchaseOrderHandlers as handlers,
  requirePurchaseOrderAccess,
} from "../../handlers";
import {
  ConstructionProcurementPurchaseOrderParamsModel,
  GetConstructionProcurementPurchaseOrderPdfRequestModel,
} from "../../purchase-order-models";

export const dynamic = "force-dynamic";

/**
 * The Purchase Order as a PDF (CM-504): Company header, supplier with
 * GSTIN, billing and delivery addresses, lines with HSN and the CGST +
 * SGST or IGST split, totals, the grand total in words, payment terms,
 * T&C and POCs, in Noto fonts. Needs Purchase Order print.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionProcurementPurchaseOrderParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requirePurchaseOrderAccess(request, id, ["print"]);
    if (isResponse(session)) return session;
    const query = parseOrThrow(
      GetConstructionProcurementPurchaseOrderPdfRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const po = await handlers.get(session.workspaceId, id);
    const [company, located, supplier, site] = await Promise.all([
      readCompanyHeader(prisma, session.workspaceId),
      handlers.location(session.workspaceId, po.location).catch(() => null),
      readSupplierContact(prisma, session.workspaceId, po.supplierId),
      po.location.kind === "project"
        ? siteLocationLabel(
            session.workspaceId,
            po.location.id,
            po.siteLocation,
          )
        : Promise.resolve(null),
    ]);
    const pdf = await renderPurchaseOrderPdf({
      company,
      locationName: located?.name ?? "",
      locationAddress: located?.address ?? null,
      locationStateCode: located?.stateCode ?? null,
      siteLocationLabel: site,
      supplierAddress: supplier?.address ?? null,
      order: po,
    });
    const disposition = query.inline === "1" ? "inline" : "attachment";
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${disposition}; filename="${pdfFileName(po.number)}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
