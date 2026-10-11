import { prisma } from "@repo/construction-db";

import { mapError } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";

import type { GetConstructionFinancePaymentCategoryOptionsResponseModel } from "../../lookup-models";

export const dynamic = "force-dynamic";

/**
 * Payment Categories for a money form's picker (ADR CM-0017). Any member of
 * the Company may list them; the form's own menu is checked on save.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const items = await prisma.constructionFinancePaymentCategory.findMany({
      where: {
        workspaceId: session.workspaceId,
        deletedAt: null,
        disabledAt: null,
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const body: GetConstructionFinancePaymentCategoryOptionsResponseModel = {
      items,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
