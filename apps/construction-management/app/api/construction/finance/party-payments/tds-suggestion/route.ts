import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  finance,
  requestPlace,
  requirePlaceAccess,
} from "../../parties/handlers";
import {
  SuggestConstructionFinanceTdsRequestModel,
  toTdsSuggestionResponse,
} from "../party-payment-models";

export const dynamic = "force-dynamic";

/**
 * The TDS 194C suggestion for a Contractor payment (CM-0017 §8): the rate
 * by payee kind (or the lower-deduction rate), the single and aggregate
 * thresholds across Projects in the financial year, the catch-up on the
 * crossing payment and the GST share out of the base. Needs Parties create.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const raw: unknown = await request.json();
    const place = requestPlace(raw, "contractor");
    const session = await requirePlaceAccess(request, "create", place);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      SuggestConstructionFinanceTdsRequestModel.safeParse(raw),
    );
    const suggestion = await finance.payments.tdsSuggestion(
      session.access,
      model,
    );
    return Response.json(toTdsSuggestionResponse(suggestion));
  } catch (error) {
    return mapError(error);
  }
}
