import { prisma } from "@repo/construction-db";

import type { AccessSession } from "@/app/api/_lib/require-access";
import { requireAccess } from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { createProjectLocations } from "@/src/composition/location-resolver";
import { projectMediaDispatcher } from "@/src/composition/project-media-listeners";
import { siteRecordDirectory } from "@/src/composition/site-record-directory";
import { siteWorkStock } from "@/src/composition/site-work-stock";
import { worksheetDirectory } from "@/src/composition/worksheet-directory";
import type { Flag } from "@/src/shared-kernel/access";
import { companyToday } from "@/src/shared-kernel/company-today";
import { InProcessEventDispatcher } from "@/src/shared-kernel/events";
import {
  equipmentSheetActions,
  EquipmentSheetHandlers,
  seesSheetMoney,
  type StoredEquipmentSheet,
} from "@/src/site-work/application/equipment-sheet-handlers";
import { EquipmentSheetSettingsHandlers } from "@/src/site-work/application/equipment-sheet-settings-handlers";
import { SITE_WORK_DOCUMENTS } from "@/src/site-work/domain/site-work-documents";
import {
  PrismaEquipmentSheetSettingsStore,
  PrismaEquipmentSheetStore,
} from "@/src/site-work/infrastructure/prisma-equipment-sheet-store";
import { PrismaEquipmentStore } from "@/src/site-work/infrastructure/prisma-equipment-store";
import { loadBackdatedCheck } from "@/src/site-work/infrastructure/site-work-guards";

import { toEquipmentSheetDetailResponse } from "./equipment-sheet-models";

export const EQUIPMENT_SHEET_MENU = SITE_WORK_DOCUMENTS.equipment_usage.menu;

/** The Project's equipment-sheet settings (CM-0016 §2), for the settings routes too. */
export const equipmentSheetSettingsHandlers =
  new EquipmentSheetSettingsHandlers({
    db: prisma,
    store: new PrismaEquipmentSheetSettingsStore(),
    projectExists: async (workspaceId, projectId) =>
      (await worksheetDirectory.projectName(prisma, workspaceId, projectId)) !=
      null,
  });

/** One set of Equipment Usage sheet handlers for every route (CM-604). */
export const equipmentSheetHandlers = new EquipmentSheetHandlers({
  db: prisma,
  store: new PrismaEquipmentSheetStore(),
  settings: equipmentSheetSettingsHandlers,
  register: new PrismaEquipmentStore(),
  directory: worksheetDirectory,
  team: siteRecordDirectory(),
  locations: createProjectLocations(),
  stock: siteWorkStock(),
  backdated: (access) => loadBackdatedCheck(prisma, access),
  today: (workspaceId) => companyToday(prisma, workspaceId),
  // Nothing listens yet: M7 takes EquipmentHireAccrued, M9 notifies.
  events: new InProcessEventDispatcher(),
  media: projectMediaDispatcher(),
});

/**
 * The Session plus the Permission Matrix check for a route about one
 * sheet: it is loaded first (404 for another Company's or a deleted one),
 * then `flag` is checked on its Project, then the plan for a write flag.
 */
export async function requireEquipmentSheetAccess(
  request: Request,
  id: string,
  flag: Flag,
): Promise<(AccessSession & { target: StoredEquipmentSheet }) | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const target = await equipmentSheetHandlers.find(session.workspaceId, id);
  const access = await requireAccess(request, EQUIPMENT_SHEET_MENU, flag, {
    projectId: target.projectId,
  });
  if (isResponse(access)) return access;
  return { ...access, target };
}

/** One sheet as the routes answer it: detail, actions, money with Financial. */
export async function equipmentSheetResponse(
  session: AccessSession,
  id: string,
  init?: ResponseInit,
): Promise<Response> {
  const sheet = await equipmentSheetHandlers.get(session.workspaceId, id);
  return Response.json(
    toEquipmentSheetDetailResponse(
      sheet,
      equipmentSheetActions(session.access, sheet),
      seesSheetMoney(session.access, sheet.projectId),
    ),
    init,
  );
}
