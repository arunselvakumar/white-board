import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { monthKeyOf } from "@/src/hrms/domain/calendar";
import { createSalaryStructureHandlers } from "@/src/hrms/infrastructure/create-salary-handlers";
import { todayIn } from "@/src/shared-kernel/calendar-date";

import {
  GetConstructionHrmsSalaryStatutoryQueryModel,
  toSalaryStatutoryResponse,
} from "./salary-statutory-models";

export const dynamic = "force-dynamic";

const handlers = createSalaryStructureHandlers();

/** PF and ESI rows and the PT slabs in force for a month (CM-314 preview). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "hrms.salary_structures",
      "read",
    );
    if (isResponse(session)) return session;
    const query = parseOrThrow(
      GetConstructionHrmsSalaryStatutoryQueryModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const month = query.month ?? monthKeyOf(todayIn("Asia/Kolkata"));
    const figures = await handlers.statutoryFigures({
      access: session.access,
      month,
    });
    return Response.json(toSalaryStatutoryResponse(month, figures));
  } catch (error) {
    return mapError(error);
  }
}
