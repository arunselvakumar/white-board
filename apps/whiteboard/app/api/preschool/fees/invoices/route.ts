import { StatusCodes } from "http-status-codes";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolManager } from "../../_lib/session";
import { fees } from "../_fees";
import { CreatePreschoolInvoiceRequestModel } from "../fee-models";

export const dynamic = "force-dynamic";

/** An extra Invoice on the Child's active Admission. */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const model = parseOrThrow(
      CreatePreschoolInvoiceRequestModel.safeParse(await request.json()),
    );
    return Response.json(await fees.accounts.createInvoice(actor, model), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapPreschoolError(error);
  }
}
