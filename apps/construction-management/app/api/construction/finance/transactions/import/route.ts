import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { readUpload } from "@/app/api/_lib/uploads";
import { importTransactions } from "@/src/finance/application/transaction-import";
import { readTransactionSheet } from "@/src/finance/infrastructure/transaction-workbook";

import { importDeps, MENU } from "../handlers";
import { ImportConstructionFinanceTransactionsRequestModel } from "../transaction-models";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Imports Transactions from the sample (CM-702): the body is the .xlsx
 * itself (as Import Inventory Stock). Every row becomes a pending
 * Transaction on the Project, or none does: 400 `IMPORT_HAS_ERRORS` with
 * `details.errors` = [{ row, field, message }]. Transactions create on
 * the Project (the menu has no Import flag).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      ImportConstructionFinanceTransactionsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireAccess(request, MENU, "create", {
      projectId: query.projectId,
    });
    if (isResponse(session)) return session;
    const upload = await readUpload(request, MAX_BYTES);
    const rows = await readTransactionSheet(upload.bytes);
    const result = await importTransactions(
      importDeps,
      session.access,
      query.projectId,
      rows,
    );
    return Response.json(result, { status: StatusCodes.CREATED });
  } catch (error) {
    return mapError(error);
  }
}
