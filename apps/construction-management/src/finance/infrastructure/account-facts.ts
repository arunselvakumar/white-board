import type { Prisma } from "@repo/construction-db";

import type { FinanceDirectory } from "../application/ports";
import type { AccountFacts } from "../domain/accounts";
import { lockAccountForShare } from "./account-ledger";

type Tx = Prisma.TransactionClient;

/**
 * Loads a live account of the Company with its holder's user, locking the
 * row `FOR SHARE` so it cannot be deleted while money is posted to it.
 * Null when there is no such account.
 */
export async function lockedAccountFacts(
  tx: Tx,
  directory: Pick<FinanceDirectory, "teamMembers">,
  workspaceId: string,
  accountId: string,
): Promise<AccountFacts | null> {
  const locked = await lockAccountForShare(tx, workspaceId, accountId);
  if (locked == null) return null;
  const row = await tx.constructionFinanceAccount.findUnique({
    where: { id: accountId },
    select: { id: true, kind: true, name: true, holderMemberId: true },
  });
  if (row == null) return null;
  const holder =
    row.holderMemberId == null
      ? null
      : ((
          await directory.teamMembers(tx, workspaceId, [row.holderMemberId])
        ).get(row.holderMemberId) ?? null);
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    holderMemberId: row.holderMemberId,
    holderUserId: holder?.userId ?? null,
  };
}
