import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { receiptsZip } from "@/src/finance/infrastructure/petty-cash-receipts";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";

import {
  PETTY_CASH_MENU,
  accountIdOf,
  pettyCashAccounts,
  pettyCashVouchers,
  type IdContext,
} from "../../../handlers";
import { ExportConstructionFinancePettyCashReceiptsQueryModel } from "../../../petty-cash-models";

export const dynamic = "force-dynamic";

/**
 * Export Receipts (CM-0017 §9): a ZIP of the photos and receipts of an
 * account's vouchers dated `from`–`to`, each named `<voucher number>
 * <n>.<ext>`. Petty Cash Download (print) on an account the caller sees;
 * 409 TOO_MANY_RECEIPTS above 500 files.
 */
export async function GET(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const session = await requireAccess(request, PETTY_CASH_MENU, "print");
    if (isResponse(session)) return session;
    const id = await accountIdOf(context);
    const query = parseOrThrow(
      ExportConstructionFinancePettyCashReceiptsQueryModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const account = await pettyCashAccounts.get(session.access, id);
    const files = await pettyCashVouchers.receiptFiles(
      session.access,
      id,
      query.from,
      query.to,
    );
    const stream = receiptsZip(objectStorage(), files);
    const name = `${account.name} receipts ${query.from} to ${query.to}.zip`;
    return new Response(stream, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="receipts.zip"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
