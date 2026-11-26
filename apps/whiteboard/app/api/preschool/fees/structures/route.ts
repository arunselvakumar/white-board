import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolManager } from "../../_lib/session";
import { fees, searchParams } from "../_fees";
import {
  ListPreschoolFeeStructuresRequestModel,
  SavePreschoolFeeStructureRequestModel,
} from "../fee-models";

export const dynamic = "force-dynamic";

/** Every Programme's default, the Centre's own amounts, and what is in force. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const query = parseOrThrow(
      ListPreschoolFeeStructuresRequestModel.safeParse(
        searchParams(request, ["academicYearId", "centreId"]),
      ),
    );
    return Response.json(await fees.structures.list(actor, query));
  } catch (error) {
    return mapPreschoolError(error);
  }
}

/** Replaces every line of one Programme's default or Centre structure. */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const model = parseOrThrow(
      SavePreschoolFeeStructureRequestModel.safeParse(await request.json()),
    );
    return Response.json(await fees.structures.save(actor, model));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
