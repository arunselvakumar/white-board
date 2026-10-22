import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { readWorkOrderPrintParties } from "@/src/composition/contracts-work-orders";
import { renderWorkOrderPdf } from "@/src/contracts/infrastructure/work-order-pdf";

import {
  requireWorkOrderAccess,
  workOrderHandlers,
} from "../../work-order-access";
import { ConstructionContractsWorkOrderParamsModel } from "../../work-order-models";

export const dynamic = "force-dynamic";

/** `WO/26-27/00001` → `WO-26-27-00001`. */
function fileName(number: string | null): string {
  return `Work-Order-${(number ?? "Draft").replace(/[^A-Za-z0-9-]+/g, "-")}`;
}

/**
 * The Work Order as a PDF (CM-1104): letterhead, Project and Contractor,
 * number, revision and dates, the lines and total, the terms, the scope
 * note and signature blocks, in Noto fonts. Quantities only without Work
 * Order Financial. `?inline=1` opens it in the browser. Needs Work Order
 * print.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionContractsWorkOrderParamsModel.safeParse(await context.params),
    );
    const session = await requireWorkOrderAccess(request, "print", id);
    if (isResponse(session)) return session;
    const print = await workOrderHandlers.print(session.access, id);
    const parties = await readWorkOrderPrintParties(
      session.workspaceId,
      print.workOrder.projectId,
      print.workOrder.contractorId,
    );
    const pdf = await renderWorkOrderPdf({ ...parties, print });
    const inline = new URL(request.url).searchParams.get("inline") === "1";
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${inline ? "inline" : "attachment"}; filename="${fileName(print.workOrder.number)}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
