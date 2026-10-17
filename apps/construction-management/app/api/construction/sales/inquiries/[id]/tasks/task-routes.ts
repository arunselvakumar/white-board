import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import type { AccessSession } from "@/app/api/_lib/require-access";

import {
  ConstructionSalesInquiryTaskParamsModel,
  toInquiryTaskResponse,
  UpdateConstructionSalesInquiryTaskRequestModel,
  toInquiryTaskInput,
} from "../../activity-models";
import {
  inquiryActivityHandlers as handlers,
  requireInquiryAccess,
} from "../../handlers";

type TaskContext = { params: Promise<{ id: string; taskId: string }> };

async function taskResponse(
  session: AccessSession,
  id: string,
  taskId: string,
): Promise<Response> {
  const task = (await handlers.tasks(session.access, id)).find(
    (item) => item.id === taskId,
  );
  return Response.json(task == null ? null : toInquiryTaskResponse(task));
}

async function open(request: Request, context: TaskContext) {
  const { id, taskId } = parseOrThrow(
    ConstructionSalesInquiryTaskParamsModel.safeParse(await context.params),
  );
  const session = await requireInquiryAccess(request, id, "update");
  return { id, taskId, session };
}

/** One Inquiry Task's commands (CM-1004), each needing Inquiry update. */
export const inquiryTaskRoutes = {
  /** Edits the title, Due date and assignee. 409 `INQUIRY_TASK_CHANGED`. */
  update: async (request: Request, context: TaskContext) => {
    try {
      const { id, taskId, session } = await open(request, context);
      if (isResponse(session)) return session;
      const model = parseOrThrow(
        UpdateConstructionSalesInquiryTaskRequestModel.safeParse(
          await request.json(),
        ),
      );
      await handlers.editTask(
        session.access,
        id,
        taskId,
        new Date(model.expectedUpdatedAt),
        toInquiryTaskInput(model),
      );
      return await taskResponse(session, id, taskId);
    } catch (error) {
      return mapError(error);
    }
  },

  /** Done (with who and when) or back to Open. */
  status: (done: boolean) => async (request: Request, context: TaskContext) => {
    try {
      const { id, taskId, session } = await open(request, context);
      if (isResponse(session)) return session;
      await handlers.setTaskDone(session.access, id, taskId, done);
      return await taskResponse(session, id, taskId);
    } catch (error) {
      return mapError(error);
    }
  },

  remove: async (request: Request, context: TaskContext) => {
    try {
      const { id, taskId, session } = await open(request, context);
      if (isResponse(session)) return session;
      await handlers.deleteTask(session.access, id, taskId);
      return new Response(null, { status: StatusCodes.NO_CONTENT });
    } catch (error) {
      return mapError(error);
    }
  },
};
