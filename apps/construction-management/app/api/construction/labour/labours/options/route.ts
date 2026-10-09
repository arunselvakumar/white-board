import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { companyToday } from "@/src/labour/infrastructure/prisma-labour-queries";
import { can } from "@/src/shared-kernel/access";
import { prisma } from "@repo/db";

import { labour } from "../handlers";
import {
  ListConstructionLabourLabourOptionsRequestModel,
  type ListConstructionLabourLabourOptionsResponseModel,
} from "../labour-models";

export const dynamic = "force-dynamic";

/**
 * Active labourers on a Project on a date, for attendance pickers
 * (CM-210). Needs `read` on Attendance for that Project; rates need
 * `financial` on Labour.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      ListConstructionLabourLabourOptionsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireAccess(request, "labour.attendance", "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const date =
      model.date ?? (await companyToday(prisma, session.workspaceId));
    const items = await labour.labours.options(
      session.workspaceId,
      model.projectId,
      date,
    );
    const financial = can(session.access, "labour.labour", "financial", {
      projectId: model.projectId,
    });
    const money = (value: number | null) => (financial ? value : null);
    const body: ListConstructionLabourLabourOptionsResponseModel = {
      items: items.map((item) => ({
        ...item,
        wagePerDay: money(item.wagePerDay),
        wagePerMonth: money(item.wagePerMonth),
        overtimeWagePerHour: money(item.overtimeWagePerHour),
      })),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
