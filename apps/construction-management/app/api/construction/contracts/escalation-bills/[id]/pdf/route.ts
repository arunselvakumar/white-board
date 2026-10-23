import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { readClientBillPrintParties } from "@/src/composition/contracts-client-bills";
import { renderEscalationBillPdf } from "@/src/contracts/infrastructure/escalation-bill-pdf";

import {
  escalationBillHandlers,
  requireEscalationBillAccess,
} from "../../escalation-bill-access";
import { ConstructionContractsEscalationBillParamsModel } from "../../escalation-bill-models";

export const dynamic = "force-dynamic";

/** `CB/26-27/00007` → `Escalation-Bill-CB-26-27-00007`. */
function fileName(number: string | null): string {
  return `Escalation-Bill-${(number ?? "Draft").replace(/[^A-Za-z0-9-]+/g, "-")}`;
}

/**
 * The escalation bill as a PDF titled "Escalation Bill" (CM-1109): the
 * period, the running bills taken (R), the working per component, GST,
 * deductions and net. Indices only without Financial. `?inline=1` opens
 * it in the browser. Needs the side's bill Print.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionContractsEscalationBillParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireEscalationBillAccess(request, "print", id);
    if (isResponse(session)) return session;
    const print = await escalationBillHandlers.print(session.access, id);
    const parties = await readClientBillPrintParties(
      session.workspaceId,
      print.bill.projectId,
    );
    const pdf = await renderEscalationBillPdf({ ...parties, print });
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
