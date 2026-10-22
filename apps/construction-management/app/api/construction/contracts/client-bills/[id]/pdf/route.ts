import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { readClientBillPrintParties } from "@/src/composition/contracts-client-bills";
import { renderClientBillPdf } from "@/src/contracts/infrastructure/client-bill-pdf";

import {
  clientBillHandlers,
  requireClientBillAccess,
} from "../../client-bill-access";
import { ConstructionContractsClientBillParamsModel } from "../../client-bill-models";

export const dynamic = "force-dynamic";

/** `RA/26-27/00001` → `Tax-Invoice-RA-26-27-00001`. */
function fileName(number: string | null): string {
  return `Tax-Invoice-${(number ?? "Draft").replace(/[^A-Za-z0-9-]+/g, "-")}`;
}

/**
 * The Client Bill as a tax invoice PDF (CM-1107): supplier and recipient
 * with their GSTINs, place of supply, SAC, the abstract and measurement
 * detail, the tax split, deductions, net receivable and amounts in words,
 * any GSTIN_NOT_IN_STATE warning and signature blocks, in Noto fonts.
 * Quantities only without Client Bill Financial. `?inline=1` opens it in
 * the browser. Needs Client Bill print.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionContractsClientBillParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireClientBillAccess(request, "print", id);
    if (isResponse(session)) return session;
    const print = await clientBillHandlers.print(session.access, id);
    const parties = await readClientBillPrintParties(
      session.workspaceId,
      print.bill.projectId,
    );
    const pdf = await renderClientBillPdf({ ...parties, print });
    const inline = new URL(request.url).searchParams.get("inline") === "1";
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${inline ? "inline" : "attachment"}; filename="${fileName(print.bill.number)}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
