import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { contractsDirectory } from "@/src/composition/contracts-directory";
import { readWorkOrderPrintParties } from "@/src/composition/contracts-work-orders";
import { reconciliationHandlers } from "@/src/composition/contracts-reconciliation";
import { renderReconciliationPdf } from "@/src/contracts/infrastructure/reconciliation-pdf";
import { prisma } from "@repo/construction-db";

import { requireWorkOrderAccess } from "../../../work-order-access";
import { ConstructionContractsWorkOrderParamsModel } from "../../../work-order-models";
import { GetConstructionContractsWorkOrderReconciliationRequestModel } from "../../../reconciliation-models";

export const dynamic = "force-dynamic";

/** `WO/26-27/00001` → `Material-Reconciliation-WO-26-27-00001`. */
function fileName(number: string | null, bill: string | null): string {
  const part = (value: string) => value.replace(/[^A-Za-z0-9-]+/g, "-");
  return `Material-Reconciliation-${part(number ?? "Draft")}${bill == null ? "" : `-${part(bill)}`}`;
}

/**
 * The material reconciliation statement as a PDF (CM-1110), at the bill
 * `?billId=` names (default as the statement). Quantities only without
 * Work Order Financial. `?inline=1` opens it in the browser. Needs Work
 * Order print.
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
    const url = new URL(request.url);
    const { billId } = parseOrThrow(
      GetConstructionContractsWorkOrderReconciliationRequestModel.safeParse({
        billId: url.searchParams.get("billId") ?? undefined,
      }),
    );
    const statement = await reconciliationHandlers.statement(
      session.access,
      id,
      billId ?? null,
    );
    const [parties, project] = await Promise.all([
      readWorkOrderPrintParties(
        session.workspaceId,
        statement.workOrder.projectId,
        statement.workOrder.contractorId,
      ),
      contractsDirectory.project(
        prisma,
        session.workspaceId,
        statement.workOrder.projectId,
      ),
    ]);
    const pdf = await renderReconciliationPdf({
      company: parties.company,
      projectName: project?.name ?? "",
      statement,
    });
    const inline = url.searchParams.get("inline") === "1";
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${inline ? "inline" : "attachment"}; filename="${fileName(statement.workOrder.number, statement.bill?.number ?? null)}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
