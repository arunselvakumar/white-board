import type { Prisma } from "@repo/construction-db";

import type { FinanceDirectory } from "../application/ports";
import type { AccountActor } from "../domain/accounts";
import type { AccountKind } from "../domain/ledger";

type Db = Prisma.TransactionClient;

export type AccountOption = {
  id: string;
  name: string;
  kind: AccountKind;
  isPrimary: boolean;
  /** Petty cash only. */
  holderMemberId: string | null;
  holderName: string | null;
  /** The actor's own petty-cash account. */
  isOwn: boolean;
};

/**
 * The accounts `actor` may move money through (ADR CM-0017 §2): every live
 * company account, and the petty-cash accounts they hold (all of them with
 * Petty Cash View all). Primary first, then company accounts by name, then
 * petty cash by holder.
 */
export async function accountOptions(
  db: Db,
  directory: Pick<FinanceDirectory, "teamMembers">,
  workspaceId: string,
  actor: AccountActor,
): Promise<AccountOption[]> {
  const rows = await db.constructionFinanceAccount.findMany({
    where: { workspaceId, deletedAt: null },
    select: {
      id: true,
      name: true,
      kind: true,
      isPrimary: true,
      holderMemberId: true,
    },
  });
  const members = await directory.teamMembers(
    db,
    workspaceId,
    rows.flatMap((row) =>
      row.holderMemberId == null ? [] : [row.holderMemberId],
    ),
  );
  const options = rows.flatMap((row): AccountOption[] => {
    const holder =
      row.holderMemberId == null ? null : members.get(row.holderMemberId);
    const isOwn = holder?.userId != null && holder.userId === actor.userId;
    if (row.kind === "petty_cash" && !isOwn && !actor.anyPettyCash) return [];
    return [
      {
        id: row.id,
        name: row.name,
        kind: row.kind,
        isPrimary: row.isPrimary,
        holderMemberId: row.holderMemberId,
        holderName: holder?.name ?? null,
        isOwn,
      },
    ];
  });
  const rank = (option: AccountOption) =>
    option.isPrimary ? 0 : option.kind === "petty_cash" ? 2 : 1;
  return options.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.holderName ?? a.name).localeCompare(b.holderName ?? b.name),
  );
}
