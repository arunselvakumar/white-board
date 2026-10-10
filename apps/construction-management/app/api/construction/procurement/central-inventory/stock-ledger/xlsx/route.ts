import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { renderStockLedgerXlsx } from "@/src/procurement/infrastructure/central-inventory-xlsx";

import { centralStore } from "../../../stores/central-store-wiring";
import {
  GetConstructionProcurementStockLedgerRequestModel,
  parseLocations,
} from "../../central-inventory-models";

export const dynamic = "force-dynamic";

const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * The Stock Ledger as an Excel file, generated on request (Central
 * Inventory print; ADR CM-0015 §12).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const session = await requireAccess(
      request,
      "procurement.central_inventory",
      "print",
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      GetConstructionProcurementStockLedgerRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const [report, profile] = await Promise.all([
      centralStore.inventory.stockLedger({
        workspaceId: session.workspaceId,
        ...model,
        locations: parseLocations(model.locations),
      }),
      prisma.constructionOrganizationCompanyProfile.findUnique({
        where: { workspaceId: session.workspaceId },
        select: { name: true, timezone: true },
      }),
    ]);
    const locations =
      model.locations == null || model.locations.trim() === ""
        ? "All Projects and Stores"
        : [...new Set(report.rows.map((row) => row.location.name))].join(
            ", ",
          ) || "Chosen locations";
    const bytes = await renderStockLedgerXlsx(report, {
      company: profile?.name ?? "",
      locations,
      generatedAt: new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: profile?.timezone ?? "Asia/Kolkata",
      }).format(new Date()),
    });
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": XLSX,
        "content-disposition": `attachment; filename="stock-ledger-${model.from}-to-${model.to}.xlsx"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
