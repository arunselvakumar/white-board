import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { readUpload } from "@/app/api/_lib/uploads";
import { RECEIPT_MAX_BYTES } from "@/src/labour/application/wage-payment-handlers";

import {
  paymentFinancial,
  requirePaymentAccess,
  wagePaymentHandlers as handlers,
} from "../../handlers";
import {
  ConstructionLabourWagePaymentParamsModel,
  toWagePaymentResponse,
} from "../../payment-models";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

async function paymentId(context: Context): Promise<string> {
  return parseOrThrow(
    ConstructionLabourWagePaymentParamsModel.safeParse(await context.params),
  ).id;
}

/** Streams the payment's receipt (Labour or Vendor read on its Project). */
export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const id = await paymentId(context);
    const session = await requirePaymentAccess(request, "read", (workspaceId) =>
      handlers.get(workspaceId, id),
    );
    if (isResponse(session)) return session;
    const object = await handlers.receipt(session.workspaceId, id);
    const isImage = object.contentType.startsWith("image/");
    const headers = new Headers({
      "content-type": object.contentType,
      "content-disposition": `${isImage ? "inline" : "attachment"}; filename="receipt.${isImage ? object.contentType.slice(6) : "pdf"}"`,
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    });
    if (object.contentLength != null)
      headers.set("content-length", String(object.contentLength));
    return new Response(object.body, { headers });
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Sets or replaces the payment's one receipt: the raw file as the body
 * with its `content-type` (PDF, PNG, JPEG or WebP, ≤ 10 MB). Part of
 * recording, so it needs Labour or Vendor create on the Project.
 */
export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const id = await paymentId(context);
    const session = await requirePaymentAccess(
      request,
      "create",
      (workspaceId) => handlers.get(workspaceId, id),
    );
    if (isResponse(session)) return session;
    const upload = await readUpload(request, RECEIPT_MAX_BYTES);
    const payment = await handlers.attachReceipt({
      actor: {
        workspaceId: session.workspaceId,
        userId: session.userId,
        role: session.role,
      },
      id,
      bytes: upload.bytes,
      contentType: upload.contentType,
    });
    return Response.json(
      toWagePaymentResponse(
        payment,
        paymentFinancial(session.access, payment.partyType, payment.projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
