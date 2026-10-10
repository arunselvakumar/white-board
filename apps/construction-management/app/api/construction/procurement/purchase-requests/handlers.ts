import { prisma } from "@repo/construction-db";

import type { AccessSession } from "@/app/api/_lib/require-access";
import { requireAccess } from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { createProjectLocations } from "@/src/composition/location-resolver";
import { projectMediaDispatcher } from "@/src/composition/project-media-listeners";
import { procurementDirectory } from "@/src/composition/procurement-directory";
import {
  PurchaseRequestHandlers,
  type StoredPurchaseRequest,
} from "@/src/procurement/application/purchase-request-handlers";
import { PROCUREMENT_DOCUMENTS } from "@/src/procurement/domain/documents";
import { PrismaPurchaseRequestStore } from "@/src/procurement/infrastructure/prisma-purchase-request-store";
import { loadBackdatedCheck } from "@/src/procurement/infrastructure/procurement-guards";
import { stockLedger } from "@/src/procurement/infrastructure/stock-ledger-instance";
import type { Flag } from "@/src/shared-kernel/access";
import { companyToday } from "@/src/shared-kernel/company-today";
import {
  locationLabel,
  type LocationRef,
} from "@/src/shared-kernel/location-ref";
import { locationNames } from "@/src/queries/location-options";
import { procurementEvents } from "@/src/procurement/infrastructure/procurement-events";

export const PURCHASE_REQUEST_MENU =
  PROCUREMENT_DOCUMENTS.purchase_request.menu;

/** One set of Purchase Request handlers for every route (CM-503). */
export const purchaseRequestHandlers = new PurchaseRequestHandlers({
  db: prisma,
  store: new PrismaPurchaseRequestStore(),
  directory: procurementDirectory,
  locations: createProjectLocations(),
  stock: stockLedger(),
  backdated: (access) => loadBackdatedCheck(prisma, access),
  today: (workspaceId) => companyToday(prisma, workspaceId),
  events: procurementEvents,
  media: projectMediaDispatcher(),
});

/**
 * The Session plus the Permission Matrix check for a route about one
 * Purchase Request: it is loaded first (404 for another Company's or a
 * deleted one), then `flag` is checked on its Project, then the plan for
 * a write flag.
 */
export async function requirePurchaseRequestAccess(
  request: Request,
  id: string,
  flag: Flag,
): Promise<(AccessSession & { target: StoredPurchaseRequest }) | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const target = await purchaseRequestHandlers.find(session.workspaceId, id);
  const access = await requireAccess(request, PURCHASE_REQUEST_MENU, flag, {
    projectId: target.projectId,
  });
  if (isResponse(access)) return access;
  return { ...access, target };
}

const projectLocations = createProjectLocations();

/** One line for a stored LocationRef ("Wing A · Floor 1"), or null. */
export async function siteLocationLabel(
  workspaceId: string,
  projectId: string,
  ref: LocationRef | null,
): Promise<string | null> {
  if (ref == null) return null;
  const options = await projectLocations.options(workspaceId, projectId);
  const names = locationNames({ structure: "wings", ...options }, ref);
  return names == null ? null : locationLabel(names);
}

/** The Project's name as documents print it. */
export async function projectName(
  workspaceId: string,
  projectId: string,
): Promise<string> {
  const projects = await procurementDirectory.projects(prisma, workspaceId, [
    projectId,
  ]);
  return projects.get(projectId)?.name ?? "";
}

/** `PR/26-27/00001` → `PR-26-27-00001` for a file name. */
export function pdfFileName(number: string): string {
  return number.replace(/[^A-Za-z0-9._-]+/g, "-");
}
