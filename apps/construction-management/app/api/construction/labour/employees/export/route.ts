import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  XLSX_CONTENT_TYPE,
  employeeExport,
} from "@/src/labour/infrastructure/employee-workbook";
import { can } from "@/src/shared-kernel/access";

import {
  EMPLOYEES_MENU,
  ExportConstructionLabourEmployeesRequestModel,
  queryBoolean,
} from "../employee-models";
import { employee } from "../handlers";

export const dynamic = "force-dynamic";

/**
 * The filtered Employees as an Excel sheet, with the import's columns plus
 * Status and Balance. Amounts and bank details only with `financial`;
 * Aadhaar, PAN and the account number masked.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, EMPLOYEES_MENU, "read");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ExportConstructionLabourEmployeesRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const items = await employee.employees.all({
      workspaceId: session.workspaceId,
      projectId: model.projectId,
      active: queryBoolean(model.active),
      search: model.q,
      labourCategoryId: model.categoryId,
      roleId: model.roleId,
      departmentId: model.departmentId,
    });
    const bytes = await employeeExport(
      items,
      can(session.access, EMPLOYEES_MENU, "financial"),
    );
    return new Response(bytes, {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition": 'attachment; filename="employees.xlsx"',
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
