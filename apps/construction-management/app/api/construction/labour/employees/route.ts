import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import {
  CreateConstructionLabourEmployeeRequestModel,
  EMPLOYEES_MENU,
  ListConstructionLabourEmployeesRequestModel,
  employeeBankInput,
  queryBoolean,
  toEmployeeCreatedResponse,
  toEmployeeResponse,
  type ListConstructionLabourEmployeesResponseModel,
} from "./employee-models";
import { employee, employeeSignIns } from "./handlers";

export const dynamic = "force-dynamic";

/**
 * Employees, newest first (ADR CM-0055): filter by Project, Active, Labour
 * Category, Role and Department, and search name, Employee Id, father's
 * name or mobile.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, EMPLOYEES_MENU, "read");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionLabourEmployeesRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const page = await employee.employees.list({
      workspaceId: session.workspaceId,
      limit: model.limit,
      after: model.after == null ? undefined : decodeListCursor(model.after),
      before: model.before == null ? undefined : decodeListCursor(model.before),
      projectId: model.projectId,
      active: queryBoolean(model.active),
      search: model.q,
      labourCategoryId: model.categoryId,
      roleId: model.roleId,
      departmentId: model.departmentId,
    });
    const items = await employeeSignIns.withSignIns(
      session.workspaceId,
      page.items,
    );
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionLabourEmployeesResponseModel = {
      items: items.map((item) => toEmployeeResponse(item, session.access)),
      nextCursor: moreAfter && last != null ? encodeListCursor(last) : null,
      prevCursor: moreBefore && first != null ? encodeListCursor(first) : null,
      total: page.total,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Add Employee (ADR CM-0055): on none, one or many Projects (ADR
 * CM-0033), with a Role, and a sign-in when "Can sign in" is on. The
 * opening balance becomes the first ledger entry, dated the joining date
 * (ADR CM-0004).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, EMPLOYEES_MENU, "create");
    if (isResponse(session)) return session;
    const { signIn, ...model } = parseOrThrow(
      CreateConstructionLabourEmployeeRequestModel.safeParse(
        await request.json(),
      ),
    );
    const created = await employeeSignIns.create({
      workspaceId: session.workspaceId,
      by: session.userId,
      grantor: session.access,
      employee: { ...model, ...employeeBankInput(model, session.access) },
      signIn,
    });
    return Response.json(toEmployeeCreatedResponse(created, session.access), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
