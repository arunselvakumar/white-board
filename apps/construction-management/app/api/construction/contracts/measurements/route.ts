import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  measurementHandlers,
  requestProjectId,
  requireMeasurementProjectAccess,
} from "./measurement-access";
import {
  CreateConstructionContractsMeasurementRequestModel,
  decodeMeasurementCursor,
  encodeMeasurementCursor,
  ListConstructionContractsMeasurementsRequestModel,
  toMeasurementResponse,
  toMeasurementSummaryResponse,
  type ListConstructionContractsMeasurementsResponseModel,
} from "./measurement-models";

export const dynamic = "force-dynamic";

/**
 * The Project's measurement sheets, latest measured first, by side, Work
 * Order, status and a date range (CM-1105). Needs Measurement Book read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const raw = Object.fromEntries(new URL(request.url).searchParams);
    const projectId = requestProjectId(raw);
    const session = await requireMeasurementProjectAccess(
      request,
      "read",
      projectId,
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionContractsMeasurementsRequestModel.safeParse(raw),
    );
    const page = await measurementHandlers.list(session.access, projectId, {
      side: model.side,
      workOrderId: model.workOrderId,
      status: model.status,
      from: model.from,
      to: model.to,
      limit: model.limit,
      after:
        model.after == null ? undefined : decodeMeasurementCursor(model.after),
      before:
        model.before == null
          ? undefined
          : decodeMeasurementCursor(model.before),
    });
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionContractsMeasurementsResponseModel = {
      items: page.items.map(toMeasurementSummaryResponse),
      nextCursor:
        moreAfter && last != null ? encodeMeasurementCursor(last) : null,
      prevCursor:
        moreBefore && first != null ? encodeMeasurementCursor(first) : null,
      total: page.total,
      viewerFlags: page.viewerFlags,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * A draft sheet (CM-1105): the client side against the BOQ, the
 * contractor side against one issued Work Order. Needs Measurement Book
 * create.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const projectId = requestProjectId(body);
    const session = await requireMeasurementProjectAccess(
      request,
      "create",
      projectId,
    );
    if (isResponse(session)) return session;
    const { projectId: _projectId, ...input } = parseOrThrow(
      CreateConstructionContractsMeasurementRequestModel.safeParse(body),
    );
    const sheet = await measurementHandlers.create(
      session.access,
      projectId,
      input,
    );
    const detail = await measurementHandlers.get(session.access, sheet.id);
    return Response.json(toMeasurementResponse(detail), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
