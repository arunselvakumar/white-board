import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { companyToday } from "@/src/labour/infrastructure/prisma-labour-queries";
import { can } from "@/src/shared-kernel/access";

import {
  ListConstructionLabourEmployeeOptionsRequestModel,
  type ListConstructionLabourEmployeeOptionsResponseModel,
} from "../employee-models";
import { employee } from "../handlers";

export const dynamic = "force-dynamic";

/**
 * Active Employees on a Project on a date, for attendance pickers. Needs
 * `read` on Attendance for that Project; rates need `financial` on
 * Employees (`labour.labour`).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      ListConstructionLabourEmployeeOptionsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireAccess(request, "labour.attendance", "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const date =
      model.date ?? (await companyToday(prisma, session.workspaceId));
    const items = await employee.employees.options(
      session.workspaceId,
      model.projectId,
      date,
    );
    const financial = can(session.access, "labour.labour", "financial", {
      projectId: model.projectId,
    });
    const money = (value: number | null) => (financial ? value : null);
    const body: ListConstructionLabourEmployeeOptionsResponseModel = {
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
