import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";

import type { z } from "zod";

import { jsonError } from "@/app/api/_lib/json-error";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  requireAccess,
  type AccessSession,
} from "@/app/api/_lib/require-access";
import { requirePlanActive } from "@/app/api/_lib/require-plan-active";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { equipmentDirectory } from "@/src/composition/equipment-directory";
import { createPlanGate } from "@/src/organization/infrastructure/create-subscription-handlers";
import type { Flag, MemberAccess } from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";
import { companyToday } from "@/src/shared-kernel/company-today";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import {
  EQUIPMENT_MENU,
  EquipmentHandlers,
  equipmentActions,
} from "@/src/site-work/application/equipment-handlers";
import { EquipmentPhotos } from "@/src/site-work/application/equipment-photos";
import { PrismaEquipmentStore } from "@/src/site-work/infrastructure/prisma-equipment-store";

import {
  ConstructionSiteWorkEquipmentMaintenanceParamsModel,
  ConstructionSiteWorkEquipmentParamsModel,
  toEquipmentDetailResponse,
} from "./equipment-models";

const store = new PrismaEquipmentStore();

/** One set of Equipment register handlers for every route (CM-603, CM-605). */
export const equipmentHandlers = new EquipmentHandlers({
  db: prisma,
  store,
  directory: equipmentDirectory,
  today: (workspaceId) => companyToday(prisma, workspaceId),
});

/** The equipment photo; its storage counts against the plan. */
export const equipmentPhotos = new EquipmentPhotos({
  db: prisma,
  store,
  storage: objectStorage(),
  plan: createPlanGate(),
});

function denied(): Response {
  return jsonError(
    StatusCodes.FORBIDDEN,
    "PERMISSION_DENIED",
    "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
  );
}

/**
 * The Session and the member's access, then `allowed(access)` — for routes
 * one of several menus opens (the register, or Equipment Usage on a
 * Project). 403 `PERMISSION_DENIED` when it says no; 402 `PLAN_EXPIRED`
 * for a write once the plan has ended.
 */
export async function requireEquipmentAccess(
  request: Request,
  allowed: (access: MemberAccess) => boolean | Promise<boolean>,
  options: { write: boolean },
): Promise<AccessSession | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const access = await loadMemberAccess(prisma, session);
  if (!(await allowed(access))) return denied();
  if (options.write) {
    const ended = await requirePlanActive(session);
    if (ended != null) return ended;
  }
  return { ...session, access };
}

type IdContext = { params: Promise<{ id: string }> };
type MaintenanceContext = {
  params: Promise<{ id: string; maintenanceId: string }>;
};

export async function equipmentIdOf(context: IdContext): Promise<string> {
  return parseOrThrow(
    ConstructionSiteWorkEquipmentParamsModel.safeParse(await context.params),
  ).id;
}

export async function maintenanceIdsOf(
  context: MaintenanceContext,
): Promise<{ id: string; maintenanceId: string }> {
  return parseOrThrow(
    ConstructionSiteWorkEquipmentMaintenanceParamsModel.safeParse(
      await context.params,
    ),
  );
}

/** The equipment as the detail page reads it, after a write. */
export async function detailResponse(
  access: MemberAccess,
  id: string,
  status: StatusCodes = StatusCodes.OK,
): Promise<Response> {
  const detail = await equipmentHandlers.get(access.workspaceId, id);
  return Response.json(
    toEquipmentDetailResponse(detail, equipmentActions(access, detail)),
    { status },
  );
}

/**
 * A register write route (Equipments `flag`): the access check, the body,
 * the command, then the equipment as it now is.
 */
export function registerWrite<T>(
  flag: Flag,
  model: z.ZodType<T>,
  run: (access: MemberAccess, id: string, body: T) => Promise<unknown>,
) {
  return async (request: Request, context: IdContext): Promise<Response> => {
    try {
      const id = await equipmentIdOf(context);
      const session = await requireAccess(request, EQUIPMENT_MENU, flag);
      if (isResponse(session)) return session;
      const body = parseOrThrow(model.safeParse(await request.json()));
      await run(session.access, id, body);
      return await detailResponse(session.access, id);
    } catch (error) {
      return mapError(error);
    }
  };
}

/** A maintenance entry's write route (Equipments Update). */
export function maintenanceWrite<T>(
  model: z.ZodType<T>,
  run: (
    access: MemberAccess,
    ids: { id: string; maintenanceId: string },
    body: T,
  ) => Promise<unknown>,
) {
  return async (
    request: Request,
    context: MaintenanceContext,
  ): Promise<Response> => {
    try {
      const ids = await maintenanceIdsOf(context);
      const session = await requireAccess(request, EQUIPMENT_MENU, "update");
      if (isResponse(session)) return session;
      const body = parseOrThrow(model.safeParse(await request.json()));
      await run(session.access, ids, body);
      return await detailResponse(session.access, ids.id);
    } catch (error) {
      return mapError(error);
    }
  };
}
