import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createSalaryStructureHandlers } from "@/src/hrms/infrastructure/create-salary-handlers";

import {
  CreateConstructionHrmsSalaryStructureRequestModel,
  toSalaryStructureResponse,
  type ListConstructionHrmsSalaryStructuresResponseModel,
} from "./salary-structure-models";

export const dynamic = "force-dynamic";

const handlers = createSalaryStructureHandlers();

/** The Company's salary structures, by name (CM-314). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "hrms.salary_structures",
      "read",
    );
    if (isResponse(session)) return session;
    const items = await handlers.list({ access: session.access });
    const body: ListConstructionHrmsSalaryStructuresResponseModel = {
      items: items.map(toSalaryStructureResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/** Adds a salary structure, audited (CM-314). */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "hrms.salary_structures",
      "create",
    );
    if (isResponse(session)) return session;
    const structure = parseOrThrow(
      CreateConstructionHrmsSalaryStructureRequestModel.safeParse(
        await request.json(),
      ),
    );
    const created = await handlers.create({
      access: session.access,
      structure,
    });
    return Response.json(toSalaryStructureResponse(created), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
