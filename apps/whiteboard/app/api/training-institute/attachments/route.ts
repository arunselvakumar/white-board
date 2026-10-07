import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { ATTACHMENT_MAX_BYTES } from "@/src/training-institute/domain/class-work";
import { createClassWorkHandlers } from "@/src/training-institute/infrastructure/create-class-work-handlers";

import { UploadTrainingInstituteAttachmentRequestModel } from "../homework/class-work-models";
import { requireClassWorkMember } from "../homework/class-work-session";

export const dynamic = "force-dynamic";

const handlers = createClassWorkHandlers();

function tooLarge(): Response {
  return jsonError(
    StatusCodes.REQUEST_TOO_LONG,
    "ATTACHMENT_TOO_LARGE",
    "Files must be 4 MB or smaller.",
  );
}

/**
 * Uploads one file as the raw request body (ADR-0033). It waits until a
 * Study Material, Homework, or Submission saved by the same User attaches it.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const member = await requireClassWorkMember();
    if (member instanceof Response) return member;
    const { name } = parseOrThrow(
      UploadTrainingInstituteAttachmentRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > ATTACHMENT_MAX_BYTES) return tooLarge();
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length > ATTACHMENT_MAX_BYTES) return tooLarge();
    const upload = await handlers.upload(member, {
      name: name ?? null,
      mimeType: request.headers.get("content-type"),
      bytes,
    });
    return Response.json(upload, { status: StatusCodes.CREATED });
  } catch (error) {
    return mapError(error);
  }
}
