import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { can } from "@/src/shared-kernel/access";

import {
  CreateConstructionSalesInquiryTaskRequestModel,
  toInquiryTaskInput,
  toInquiryTaskResponse,
  type ListConstructionSalesInquiryTasksResponse,
} from "../../activity-models";
import {
  INQUIRY_MENU,
  inquiryActivityHandlers as handlers,
  requireInquiryAccess,
} from "../../handlers";
import { ConstructionSalesInquiryParamsModel } from "../../inquiry-models";

export const dynamic = "force-dynamic";

/** The inquiry's tasks (CM-1004; Inquiry read, View all as the inquiry). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionSalesInquiryParamsModel.safeParse(await context.params),
    );
    const session = await requireInquiryAccess(request, id, "read");
    if (isResponse(session)) return session;
    const tasks = await handlers.tasks(session.access, id);
    const body: ListConstructionSalesInquiryTasksResponse = {
      items: tasks.map(toInquiryTaskResponse),
      canManage: can(session.access, INQUIRY_MENU, "update", {
        projectId: session.target.projectId,
      }),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/** Adds an Inquiry Task (CM-1004; Inquiry update). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionSalesInquiryParamsModel.safeParse(await context.params),
    );
    const session = await requireInquiryAccess(request, id, "update");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionSalesInquiryTaskRequestModel.safeParse(
        await request.json(),
      ),
    );
    const taskId = await handlers.createTask(
      session.access,
      id,
      toInquiryTaskInput(model),
    );
    const task = (await handlers.tasks(session.access, id)).find(
      (item) => item.id === taskId,
    );
    return Response.json(task == null ? null : toInquiryTaskResponse(task), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
