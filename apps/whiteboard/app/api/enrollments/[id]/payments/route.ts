import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createEnrollmentHandlers } from "@/src/training-institute/infrastructure/create-enrollment-handlers";

import { ListFeePaymentsParamsModel } from "../../list-fee-payments-params-model";
import { ListFeePaymentsRequestModel } from "../../list-fee-payments-request-model";
import { mapFeePaymentResponse } from "../../../payments/map-fee-payment-response";
import { RecordFeePaymentParamsModel } from "../../record-fee-payment-params-model";
import { RecordFeePaymentRequestModel } from "../../record-fee-payment-request-model";

export const dynamic = "force-dynamic";

const handlers = createEnrollmentHandlers();

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) {
      return session;
    }
    const { id } = await context.params;
    const params = parseOrThrow(RecordFeePaymentParamsModel.safeParse({ id }));
    const body: unknown = await request.json();
    const model = parseOrThrow(RecordFeePaymentRequestModel.safeParse(body));
    const payment = await handlers.recordPayment.execute({
      enrollmentId: params.id,
      amountPaise: model.amountPaise,
      method: model.method,
      paidAt: model.paidAt,
      workspaceId: session.orgId,
      recordedByUserId: session.userId,
    });
    return Response.json(mapFeePaymentResponse(payment), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) {
      return session;
    }
    const { id } = await context.params;
    const params = parseOrThrow(ListFeePaymentsParamsModel.safeParse({ id }));
    const url = new URL(request.url);
    const model = parseOrThrow(
      ListFeePaymentsRequestModel.safeParse({
        limit: url.searchParams.get("limit") ?? undefined,
        after: url.searchParams.get("after") ?? undefined,
        before: url.searchParams.get("before") ?? undefined,
      }),
    );
    const page = await handlers.listPayments.execute({
      enrollmentId: params.id,
      workspaceId: session.orgId,
      limit: model.limit,
      after: model.after,
      before: model.before,
    });
    return Response.json({
      items: page.items.map(mapFeePaymentResponse),
      nextCursor: page.nextCursor,
      prevCursor: page.prevCursor,
      total: page.total,
    });
  } catch (error) {
    return mapError(error);
  }
}
