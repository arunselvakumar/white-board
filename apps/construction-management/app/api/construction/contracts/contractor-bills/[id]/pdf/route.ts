import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { readWorkOrderPrintParties } from "@/src/composition/contracts-work-orders";
import { renderContractorBillPdf } from "@/src/contracts/infrastructure/contractor-bill-pdf";

import {
  contractorBillHandlers,
  requireContractorBillAccess,
} from "../../contractor-bill-access";
import { ConstructionContractsContractorBillParamsModel } from "../../contractor-bill-models";

export const dynamic = "force-dynamic";

/** `CB/26-27/00001` → `Contractor-Bill-CB-26-27-00001`. */
function fileName(number: string | null): string {
  return `Contractor-Bill-${(number ?? "Draft").replace(/[^A-Za-z0-9-]+/g, "-")}`;
}

/**
 * The Contractor Bill as a PDF (CM-1106): the abstract, the measurement
 * detail behind each line, the deductions, GST and net, the TDS estimate
 * and signature blocks, in Noto fonts. Quantities only without Contractor
 * Bill Financial. `?inline=1` opens it in the browser. Needs Contractor
 * Bill print.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionContractsContractorBillParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireContractorBillAccess(request, "print", id);
    if (isResponse(session)) return session;
    const print = await contractorBillHandlers.print(session.access, id);
    const parties = await readWorkOrderPrintParties(
      session.workspaceId,
      print.bill.projectId,
      print.bill.contractorId,
    );
    const pdf = await renderContractorBillPdf({ ...parties, print });
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
