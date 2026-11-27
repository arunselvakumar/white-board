import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  XLSX_CONTENT_TYPE,
  employeeTemplate,
} from "@/src/labour/infrastructure/employee-workbook";

import { EMPLOYEES_MENU } from "../employee-models";
import { employee } from "../handlers";

export const dynamic = "force-dynamic";

/**
 * The sample Excel sheet for the Employee import: headers, one example
 * row (a Labour), and a Lists sheet with the Company's Departments, Roles,
 * Projects and Labour Categories.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, EMPLOYEES_MENU, "read");
    if (isResponse(session)) return session;
    const lookups = await employee.lookups.all(session.workspaceId);
    const bytes = await employeeTemplate({
      departments: lookups.departments.map((item) => item.name),
      roles: lookups.roles.map((item) => item.name),
      projects: lookups.projects.map((item) => item.name),
      labourCategories: lookups.labourCategories
        .filter((item) => !item.disabled)
        .map((item) => item.name),
    });
    return new Response(bytes, {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition":
          'attachment; filename="employee-import-sample.xlsx"',
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
