import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { readUpload } from "@/app/api/_lib/uploads";
import { readEmployeeSheet } from "@/src/labour/infrastructure/employee-workbook";

import {
  EMPLOYEES_MENU,
  ImportConstructionLabourEmployeesRequestModel,
  type ImportConstructionLabourEmployeesResponseModel,
} from "../employee-models";
import { employee } from "../handlers";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Imports Employees from the sample sheet (a Labour sheet from before
 * Employees too). The body is the .xlsx file itself. `?dryRun=true`
 * (default) previews every row with its errors; `?dryRun=false` adds all
 * rows in one transaction, or none: 400 `IMPORT_HAS_ERRORS` with the
 * preview in `details`. Needs `create` on Employees. Nobody imported signs
 * in.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, EMPLOYEES_MENU, "create");
    if (isResponse(session)) return session;
    const query = parseOrThrow(
      ImportConstructionLabourEmployeesRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const dryRun = query.dryRun !== "false";
    const upload = await readUpload(request, MAX_BYTES);
    const sheet = await readEmployeeSheet(upload.bytes);
    if (dryRun) {
      const preview = await employee.importer.preview(
        session.workspaceId,
        sheet,
      );
      const body: ImportConstructionLabourEmployeesResponseModel = {
        ...preview,
        imported: 0,
      };
      return Response.json(body);
    }
    const result = await employee.importer.commit({
      workspaceId: session.workspaceId,
      sheet,
      by: session.userId,
    });
    const body: ImportConstructionLabourEmployeesResponseModel = result;
    return Response.json(body, { status: StatusCodes.CREATED });
  } catch (error) {
    return mapError(error);
  }
}
