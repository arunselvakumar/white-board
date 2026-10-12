import { Prisma, prisma, type PrismaClient } from "@repo/construction-db";

import { assertCan, type MemberAccess } from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError, conflict } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import {
  PETTY_CASH_MENU,
  seesEveryPettyCashAccount,
  seesPettyCashAccount,
} from "../application/petty-cash-access";
import type { FinanceDirectory } from "../application/ports";
import { MAX_AMOUNT } from "../domain/ledger";
import {
  defaultPettyCashAccountName,
  pendingEffect,
  pettyCashAccountExists,
  pettyCashAccountInUse,
  pettyCashAccountName,
  pettyCashAccountNotFound,
} from "../domain/petty-cash";
import { accountLedger } from "./account-ledger";
import { assertPettyCashPeriodOpen } from "./petty-cash-guards";

type Tx = Prisma.TransactionClient;
type Directory = Pick<FinanceDirectory, "teamMembers" | "memberOfUser">;

export type PettyCashAccountView = {
  id: string;
  name: string;
  holderMemberId: string;
  holderName: string;
  /** Null until the holder joins. */
  holderUserId: string | null;
  isOwn: boolean;
  openingDate: CalendarDate;
  /** Paise: approved entries only (CM-0017 §4). */
  balance: bigint;
  /** Paise: what the pending vouchers would add (+) or take (−). */
  pendingTotal: bigint;
  pendingCount: number;
  lastVoucherDate: CalendarDate | null;
  /** No vouchers and no entries besides the opening: it can be closed. */
  canClose: boolean;
  createdAt: Date;
};

type AccountRow = {
  id: string;
  name: string;
  holderMemberId: string | null;
  openingDate: Date;
  createdAt: Date;
};

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Petty-cash accounts (CM-703, ADR CM-0017 §2, §9): one live account per
 * Team Member, its balance the sum of its approved entries, the pending
 * vouchers beside it. Without Petty Cash View all a member sees only the
 * account they hold.
 */
export class PettyCashAccounts {
  constructor(
    private readonly directory: Directory,
    private readonly db: PrismaClient = prisma,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async views(
    workspaceId: string,
    rows: readonly AccountRow[],
    viewerUserId: string,
  ): Promise<PettyCashAccountView[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const [members, balances, pending, facts] = await Promise.all([
      this.directory.teamMembers(
        this.db,
        workspaceId,
        rows.flatMap((row) =>
          row.holderMemberId == null ? [] : [row.holderMemberId],
        ),
      ),
      accountLedger.balances(this.db, workspaceId, ids),
      this.db.constructionFinancePettyCashVoucher.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          approvalStatus: "pending",
          OR: [{ accountId: { in: ids } }, { toAccountId: { in: ids } }],
        },
        select: {
          accountId: true,
          toAccountId: true,
          voucherType: true,
          amount: true,
        },
      }),
      this.db.$queryRaw<
        {
          id: string;
          lastVoucherDate: Date | null;
          vouchers: bigint;
          otherEntries: bigint;
        }[]
      >(Prisma.sql`
        SELECT a.id::text AS id,
          (SELECT max(v.voucher_date) FROM construction_finance.petty_cash_vouchers v
            WHERE v.account_id = a.id AND v.deleted_at IS NULL) AS "lastVoucherDate",
          (SELECT count(*) FROM construction_finance.petty_cash_vouchers v
            WHERE (v.account_id = a.id OR v.to_account_id = a.id)
              AND v.deleted_at IS NULL) AS vouchers,
          (SELECT count(*) FROM construction_finance.account_entries e
            WHERE e.account_id = a.id AND e.source_type <> 'account') AS "otherEntries"
        FROM construction_finance.accounts a
        WHERE a.id = ANY(${ids}::uuid[])`),
    ]);
    const byId = new Map(facts.map((row) => [row.id, row]));
    return rows.map((row) => {
      const holder =
        row.holderMemberId == null ? null : members.get(row.holderMemberId);
      const mine = pending.filter(
        (voucher) =>
          voucher.accountId === row.id || voucher.toAccountId === row.id,
      );
      const fact = byId.get(row.id);
      return {
        id: row.id,
        name: row.name,
        holderMemberId: row.holderMemberId ?? "",
        holderName: holder?.name ?? "Former Team Member",
        holderUserId: holder?.userId ?? null,
        isOwn: holder?.userId != null && holder.userId === viewerUserId,
        openingDate: calendarDateFromDb(row.openingDate),
        balance: balances.get(row.id) ?? 0n,
        pendingTotal: mine.reduce(
          (sum, voucher) => sum + pendingEffect(voucher, row.id),
          0n,
        ),
        pendingCount: mine.length,
        lastVoucherDate:
          fact?.lastVoucherDate == null
            ? null
            : calendarDateFromDb(fact.lastVoucherDate),
        canClose: fact?.vouchers === 0n && fact.otherEntries === 0n,
        createdAt: row.createdAt,
      };
    });
  }

  private select = {
    id: true,
    name: true,
    holderMemberId: true,
    openingDate: true,
    createdAt: true,
  } as const;

  /**
   * The petty-cash accounts the viewer may see, by holder: every one with
   * View all (the Owner too), otherwise only their own (none when they
   * hold none).
   */
  async list(access: MemberAccess): Promise<PettyCashAccountView[]> {
    const { workspaceId } = access;
    let holder: string | null = null;
    if (!seesEveryPettyCashAccount(access)) {
      const member = await this.directory.memberOfUser(
        this.db,
        workspaceId,
        access.userId,
      );
      if (member == null) return [];
      holder = member.id;
    }
    const rows = await this.db.constructionFinanceAccount.findMany({
      where: {
        workspaceId,
        kind: "petty_cash",
        deletedAt: null,
        ...(holder == null ? {} : { holderMemberId: holder }),
      },
      select: this.select,
    });
    const views = await this.views(workspaceId, rows, access.userId);
    return views.sort(
      (a, b) =>
        Number(b.isOwn) - Number(a.isOwn) ||
        a.holderName.localeCompare(b.holderName),
    );
  }

  /** One account the viewer may see; 404 otherwise. */
  async get(access: MemberAccess, id: string): Promise<PettyCashAccountView> {
    const view = await this.load(access, id);
    if (!seesPettyCashAccount(access, view)) throw pettyCashAccountNotFound();
    return view;
  }

  /** One live petty-cash account of the Company, whoever may see it. */
  private async load(
    access: MemberAccess,
    id: string,
  ): Promise<PettyCashAccountView> {
    const row = await this.db.constructionFinanceAccount.findFirst({
      where: {
        id,
        workspaceId: access.workspaceId,
        kind: "petty_cash",
        deletedAt: null,
      },
      select: this.select,
    });
    if (row == null) throw pettyCashAccountNotFound();
    const [view] = await this.views(access.workspaceId, [row], access.userId);
    if (view == null) throw pettyCashAccountNotFound();
    return view;
  }

  /**
   * Opens a Team Member's petty-cash account (Petty Cash Create): one live
   * account each (409 `PETTY_CASH_ACCOUNT_EXISTS`), named "Petty cash —
   * <member>" unless a name is typed (409 `ACCOUNT_NAME_TAKEN` among live
   * accounts, any case). An opening balance posts an opening entry on the
   * opening date (today by default), which the Financial Closing Date
   * guards.
   */
  async open(
    access: MemberAccess,
    input: {
      holderMemberId: string;
      name?: string | null;
      openingBalance?: bigint;
      openingDate?: CalendarDate | null;
      today: CalendarDate;
    },
  ): Promise<PettyCashAccountView> {
    assertCan(access, PETTY_CASH_MENU, "create");
    const { workspaceId } = access;
    const holder = (
      await this.directory.teamMembers(this.db, workspaceId, [
        input.holderMemberId,
      ])
    ).get(input.holderMemberId);
    if (!holder?.active)
      throw new DomainError(
        "TEAM_MEMBER_NOT_FOUND",
        "Choose an active Team Member.",
        { details: { field: "holderMemberId" } },
      );
    const name =
      input.name == null || input.name.trim() === ""
        ? defaultPettyCashAccountName(holder.name)
        : pettyCashAccountName(input.name);
    const opening = input.openingBalance ?? 0n;
    if (opening < 0n || opening > MAX_AMOUNT)
      throw new DomainError(
        "AMOUNT_INVALID",
        "Enter an opening balance of zero or more, at most ₹100 crore.",
        { details: { field: "openingBalance" } },
      );
    const openingDate = input.openingDate ?? input.today;
    if (opening > 0n)
      await assertPettyCashPeriodOpen(this.db, workspaceId, openingDate);
    const now = this.clock();
    const id = newId(now.getTime());
    try {
      await this.db.$transaction(async (tx) => {
        await this.assertFree(tx, workspaceId, holder, name);
        await tx.constructionFinanceAccount.create({
          data: {
            id,
            workspaceId,
            kind: "petty_cash",
            name,
            holderMemberId: holder.id,
            openingDate: calendarDateToDb(openingDate),
            createdAt: now,
            updatedAt: now,
            createdBy: access.userId,
            updatedBy: access.userId,
          },
        });
        await accountLedger.post(tx, workspaceId, access.userId, [
          {
            accountId: id,
            projectId: null,
            entryDate: openingDate,
            kind: "opening",
            amount: opening,
            narration: "Opening balance",
            sourceType: "account",
            sourceId: id,
          },
        ]);
        await recordAudit(tx, {
          workspaceId,
          actorUserId: access.userId,
          action: "petty_cash_account.opened",
          entityType: "account",
          entityId: id,
          occurredAt: now,
          after: {
            name,
            holderMemberId: holder.id,
            openingBalance: opening.toString(),
            openingDate,
          },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error))
        await this.db.$transaction((tx) =>
          this.assertFree(tx, workspaceId, holder, name),
        );
      throw error;
    }
    // Create alone may open an account for another Team Member (CM-0017
    // §2), so the one who opened it gets it back without View all.
    return this.load(access, id);
  }

  private async assertFree(
    tx: Tx,
    workspaceId: string,
    holder: { id: string; name: string },
    name: string,
  ): Promise<void> {
    const existing = await tx.constructionFinanceAccount.findFirst({
      where: {
        workspaceId,
        kind: "petty_cash",
        holderMemberId: holder.id,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existing != null) throw pettyCashAccountExists(holder.name);
    const named = await tx.constructionFinanceAccount.findFirst({
      where: {
        workspaceId,
        deletedAt: null,
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (named != null)
      throw conflict(
        "ACCOUNT_NAME_TAKEN",
        "An account with this name already exists.",
        { field: "name" },
      );
  }

  /**
   * Closes (tombstones) an account with no vouchers and no entries but its
   * opening (Petty Cash Delete): 409 `PETTY_CASH_ACCOUNT_IN_USE`
   * otherwise. Its opening entry stays, as every entry does.
   */
  async close(access: MemberAccess, id: string): Promise<void> {
    assertCan(access, PETTY_CASH_MENU, "delete");
    const view = await this.get(access, id);
    const now = this.clock();
    await this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id::text AS id FROM construction_finance.accounts
        WHERE id = ${id}::uuid AND workspace_id = ${access.workspaceId}
          AND deleted_at IS NULL
        FOR UPDATE`);
      if (locked.length === 0) throw pettyCashAccountNotFound();
      const [vouchers, entries] = await Promise.all([
        tx.constructionFinancePettyCashVoucher.count({
          where: {
            workspaceId: access.workspaceId,
            deletedAt: null,
            OR: [{ accountId: id }, { toAccountId: id }],
          },
        }),
        tx.constructionFinanceAccountEntry.count({
          where: {
            workspaceId: access.workspaceId,
            accountId: id,
            sourceType: { not: "account" },
          },
        }),
      ]);
      if (vouchers > 0 || entries > 0) throw pettyCashAccountInUse();
      await tx.constructionFinanceAccount.update({
        where: { id },
        data: { deletedAt: now, deletedBy: access.userId },
      });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "petty_cash_account.closed",
        entityType: "account",
        entityId: id,
        occurredAt: now,
        before: { name: view.name, holderMemberId: view.holderMemberId },
      });
    });
  }
}
