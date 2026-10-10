import { prisma } from "@repo/construction-db";

import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import { requirePlanActive } from "@/app/api/_lib/require-plan-active";
import {
  isResponse,
  requireCompanySession,
  type CompanySession,
} from "@/app/api/_lib/require-session";
import { createProjectLocations } from "@/src/composition/location-resolver";
import { procurementDirectory } from "@/src/composition/procurement-directory";
import { contentDisposition } from "@/app/api/_lib/uploads";
import { canAtLocation } from "@/src/procurement/application/inventory-access";
import type { StockLocation } from "@/src/procurement/domain/stock-location";
import { XLSX_CONTENT_TYPE } from "@/src/procurement/infrastructure/inventory-workbook";
import {
  StockMovementCommands,
  type InventoryCaller,
} from "@/src/procurement/infrastructure/stock-movement-store";
import { StockSettingsCommands } from "@/src/procurement/infrastructure/stock-settings-store";
import type { Flag } from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";
import { isWriteFlag } from "@/src/shared-kernel/plan";
import { procurementEvents } from "@/src/procurement/infrastructure/procurement-events";

/** Procurement events after commit (the one shared dispatcher). */
export { procurementEvents };

/** Consume, Missing, Adjust stock, edits, deletes and Import (CM-506). */
export const stockMovements = new StockMovementCommands({
  db: prisma,
  directory: procurementDirectory,
  locations: createProjectLocations(),
  dispatcher: procurementEvents,
});

/** Estimated Qty, the minimum override and the alert toggle (CM-506). */
export const stockSettings = new StockSettingsCommands({
  db: prisma,
  directory: procurementDirectory,
  dispatcher: procurementEvents,
});

function permissionDenied(): Response {
  return jsonError(
    StatusCodes.FORBIDDEN,
    "PERMISSION_DENIED",
    "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
  );
}

export type InventorySession = CompanySession & { caller: InventoryCaller };

/**
 * The Session plus the stock permission check (CM-506): Current Inventory
 * on a Project, Central store on a Store (`canAtLocation`); 403
 * `PERMISSION_DENIED`, then 402 `PLAN_EXPIRED` for a write flag. With no
 * location (a route about one movement), only the Session: the command
 * loads the movement and checks its location.
 */
export async function requireInventoryAccess(
  request: Request,
  location: StockLocation | null,
  flag: Flag,
): Promise<InventorySession | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const access = await loadMemberAccess(prisma, session);
  if (location != null && !canAtLocation(access, location, flag))
    return permissionDenied();
  if (isWriteFlag(flag)) {
    const ended = await requirePlanActive(session);
    if (ended != null) return ended;
  }
  return {
    ...session,
    caller: {
      actor: {
        workspaceId: session.workspaceId,
        userId: session.userId,
        role: session.role,
      },
      access,
    },
  };
}

/** The xlsx download headers. */
export function xlsxResponse(
  bytes: Uint8Array<ArrayBuffer>,
  fileName: string,
): Response {
  return new Response(bytes, {
    headers: {
      "content-type": XLSX_CONTENT_TYPE,
      "content-disposition": contentDisposition("attachment", fileName),
      "cache-control": "no-store",
    },
  });
}

/** A file-name-safe slug of a location's name. */
export function fileSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "location"
  );
}
