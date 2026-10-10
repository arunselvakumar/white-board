import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { PDF_CONTENT_TYPE } from "@/src/hrms/infrastructure/prisma-payslip-files";

import { ConstructionHrmsSalaryIdParamsModel } from "../../salary-models";
import { salaryHandlers } from "../../salary-route";

export const dynamic = "force-dynamic";

/**
 * The payslip PDF of an Approved or Paid salary (CM-316): one's own
 * (`hrms.salaries` read), or anyone's with view_all and financial. Stored
 * on approval or the first download and never changed after.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionHrmsSalaryIdParamsModel.safeParse(await context.params),
    );
    const session = await requireAccess(request, "hrms.salaries", "read");
    if (isResponse(session)) return session;
    const { bytes, fileName, unicodeFileName } = await salaryHandlers.payslip(
      session.access,
      id,
    );
    const inline = new URL(request.url).searchParams.get("inline") === "1";
    return new Response(Uint8Array.from(bytes), {
      headers: {
        "content-type": PDF_CONTENT_TYPE,
        "content-disposition": `${inline ? "inline" : "attachment"}; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(unicodeFileName)}`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
