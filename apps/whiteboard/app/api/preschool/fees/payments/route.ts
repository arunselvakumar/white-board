import { StatusCodes } from "http-status-codes";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolManager } from "../../_lib/session";
import { fees, searchParams } from "../_fees";
import {
  ListPreschoolFeePaymentsRequestModel,
  RecordPreschoolFeePaymentRequestModel,
} from "../fee-models";

export const dynamic = "force-dynamic";

/** A Centre's Fee Payments, newest first. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const query = parseOrThrow(
      ListPreschoolFeePaymentsRequestModel.safeParse(
        searchParams(request, ["centreId", "from", "to", "limit", "cursor"]),
      ),
    );
    return Response.json(await fees.payments.list(actor, query));
  } catch (error) {
    return mapPreschoolError(error);
  }
}

/** Records a Fee Payment and returns its Receipt. */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const model = parseOrThrow(
      RecordPreschoolFeePaymentRequestModel.safeParse(await request.json()),
    );
    return Response.json(await fees.payments.record(actor, model), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapPreschoolError(error);
  }
}
