import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { contentDisposition } from "@/app/api/_lib/uploads";
import {
  transactionImportSample,
  XLSX_CONTENT_TYPE,
} from "@/src/finance/infrastructure/transaction-workbook";

import { MENU } from "../handlers";
import { ImportConstructionFinanceTransactionsRequestModel } from "../transaction-models";

export const dynamic = "force-dynamic";

/**
 * The Transactions import sample (CM-702): the headers and one example
 * row naming one of the Company's Bank accounts. Transactions read on the
 * Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      ImportConstructionFinanceTransactionsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireAccess(request, MENU, "read", {
      projectId: query.projectId,
    });
    if (isResponse(session)) return session;
    const bank = await prisma.constructionFinanceAccount.findFirst({
      where: {
        workspaceId: session.workspaceId,
        deletedAt: null,
        kind: "bank",
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: { name: true },
    });
    const bytes = await transactionImportSample(
      bank?.name ?? "Company's Bank Account",
    );
    return new Response(bytes, {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition": contentDisposition(
          "attachment",
          "transactions-import-sample.xlsx",
        ),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
