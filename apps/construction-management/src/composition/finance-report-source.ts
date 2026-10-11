import { Prisma, prisma, type PrismaClient } from "@repo/construction-db";

import { financeDirectory } from "@/src/composition/finance-directory";
import {
  invoiceBalance,
  invoiceWrittenOff,
  partyDues,
  tdsShare,
} from "@/src/finance/domain/dues";
import type { PartyType } from "@/src/finance/domain/ledger";
import {
  accountStatement,
  statementAccount,
} from "@/src/finance/infrastructure/account-statement";
import {
  loadDueInvoices,
  nameOfParty,
  partyNames,
} from "@/src/finance/infrastructure/due-invoices";
import type { FinanceReportSource } from "@/src/reporting/application/ports";
import type {
  LedgerReportEntry,
  PartyReportInvoice,
  PartyReportParty,
  PettyCashReportAccount,
  PettyCashReportVoucher,
} from "@/src/reporting/domain/finance-reports";
import { calendarDateFromDb } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

function missing(code: string, message: string): DomainError {
  return new DomainError(code, message);
}

/**
 * The finance reports' read model (CM-709): plain reads of the finance
 * tables, with names from masters, projects and organization. Lives in
 * composition because it crosses contexts and uses finance's own rules
 * (invoice balances, TDS shares, ageing); reporting only sees the
 * `FinanceReportSource` port.
 */
export function createFinanceReportSource(
  db: PrismaClient = prisma,
): FinanceReportSource {
  async function projectNames(
    workspaceId: string,
    ids: Iterable<string | null>,
  ): Promise<Map<string, string>> {
    const wanted = [...new Set(ids)].filter((id): id is string => id != null);
    if (wanted.length === 0) return new Map();
    const rows = await db.constructionProjectsProject.findMany({
      where: { workspaceId, id: { in: wanted } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  async function categoryNames(
    workspaceId: string,
    ids: Iterable<string | null>,
  ): Promise<Map<string, string>> {
    const wanted = [...new Set(ids)].filter((id): id is string => id != null);
    if (wanted.length === 0) return new Map();
    const rows = await db.constructionFinancePaymentCategory.findMany({
      where: { workspaceId, id: { in: wanted } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  async function accountNames(
    workspaceId: string,
    ids: Iterable<string | null>,
  ): Promise<Map<string, string>> {
    const wanted = [...new Set(ids)].filter((id): id is string => id != null);
    if (wanted.length === 0) return new Map();
    const rows = await db.constructionFinanceAccount.findMany({
      where: { workspaceId, id: { in: wanted } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  async function assertParty(
    workspaceId: string,
    partyType: "contractor" | "supplier",
    partyId: string,
  ): Promise<void> {
    const where = { workspaceId, id: partyId };
    const found =
      partyType === "contractor"
        ? await db.constructionMastersContractor.count({ where })
        : await db.constructionMastersSupplier.count({ where });
    if (found === 0)
      throw missing(
        partyType === "contractor"
          ? "CONTRACTOR_NOT_FOUND"
          : "SUPPLIER_NOT_FOUND",
        `There is no such ${partyType === "contractor" ? "Contractor" : "Supplier"}.`,
      );
  }

  return {
    async ledger(workspaceId, params) {
      // The same read as the account's statement screen, so the two agree.
      const account = await statementAccount(
        db,
        financeDirectory,
        workspaceId,
        params.accountId,
      );
      if (account == null)
        throw missing("ACCOUNT_NOT_FOUND", "There is no such account.");
      const [statement, category] = await Promise.all([
        accountStatement(db, financeDirectory, workspaceId, account, {
          from: params.from,
          to: params.to,
          ...(params.module == null ? {} : { sourceType: params.module }),
          ...(params.categoryId == null
            ? {}
            : { paymentCategoryId: params.categoryId }),
          ...(params.mode == null ? {} : { mode: params.mode }),
          ...(params.counterpartyKind == null
            ? {}
            : { counterpartyKind: params.counterpartyKind }),
        }),
        categoryNames(workspaceId, [params.categoryId]),
      ]);
      return {
        account: {
          name: account.name,
          kind: account.kind,
          holder:
            account.kind === "petty_cash"
              ? (account.holderName ?? "Former Team Member")
              : null,
        },
        opening: statement.opening,
        closing: statement.closing,
        entries: statement.entries.map((line): LedgerReportEntry => ({
          date: line.entryDate,
          documentNumber: line.documentNumber,
          kind: line.kind,
          module: line.sourceType,
          isReversal: line.isReversal,
          counterpartyKind: null,
          counterpartyName: line.counterpartyName,
          category: line.paymentCategoryName,
          mode: line.mode,
          reference: line.reference,
          project: line.projectName,
          narration: line.narration,
          amount: line.amount,
        })),
        filters: {
          category:
            params.categoryId == null
              ? null
              : (category.get(params.categoryId) ?? "A removed category"),
          mode: params.mode,
          module: params.module,
          counterpartyKind: params.counterpartyKind,
        },
      };
    },

    async pettyCash(workspaceId, projectId, params) {
      const scoped =
        params.accountId != null
          ? [params.accountId]
          : (params.accountIds ?? null);
      const accounts = await db.constructionFinanceAccount.findMany({
        where: {
          workspaceId,
          kind: "petty_cash",
          ...(scoped == null ? { deletedAt: null } : { id: { in: scoped } }),
        },
        select: { id: true, name: true, holderMemberId: true },
        orderBy: { name: "asc" },
      });
      if (params.accountId != null && accounts.length === 0)
        throw missing(
          "PETTY_CASH_ACCOUNT_NOT_FOUND",
          "There is no such petty-cash account.",
        );
      const ids = accounts.map((account) => account.id);
      if (ids.length === 0) return { vouchers: [], accounts: [] };
      const [vouchers, pending, closings, members] = await Promise.all([
        db.constructionFinancePettyCashVoucher.findMany({
          where: {
            workspaceId,
            deletedAt: null,
            projectId,
            voucherDate: {
              gte: new Date(`${params.from}T00:00:00.000Z`),
              lte: new Date(`${params.to}T00:00:00.000Z`),
            },
            OR: [{ accountId: { in: ids } }, { toAccountId: { in: ids } }],
          },
          orderBy: [{ voucherDate: "asc" }, { number: "asc" }],
        }),
        db.constructionFinancePettyCashVoucher.findMany({
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
        db.$queryRaw<{ accountId: string; amount: bigint }[]>(Prisma.sql`
          SELECT account_id::text AS "accountId",
            COALESCE(SUM(amount), 0)::bigint AS amount
          FROM construction_finance.account_entries
          WHERE workspace_id = ${workspaceId}
            AND account_id = ANY(${ids}::uuid[])
            AND entry_date <= ${params.to}::date
          GROUP BY account_id`),
        financeDirectory.teamMembers(
          db,
          workspaceId,
          accounts.flatMap((account) =>
            account.holderMemberId == null ? [] : [account.holderMemberId],
          ),
        ),
      ]);
      const inScope = new Set(ids);
      const names = await accountNames(workspaceId, [
        ...ids,
        ...vouchers.map((voucher) => voucher.toAccountId),
        ...vouchers.map((voucher) => voucher.accountId),
      ]);
      const categories = await categoryNames(
        workspaceId,
        vouchers.map((voucher) => voucher.paymentCategoryId),
      );
      const rows: PettyCashReportVoucher[] = [];
      for (const voucher of vouchers) {
        const base = {
          date: calendarDateFromDb(voucher.voucherDate),
          number: voucher.number,
          type: voucher.voucherType,
          category:
            voucher.paymentCategoryId == null
              ? null
              : (categories.get(voucher.paymentCategoryId) ?? null),
          amount: voucher.amount,
          status: voucher.approvalStatus,
          description: voucher.description ?? voucher.paidFor,
        };
        if (inScope.has(voucher.accountId))
          rows.push({
            ...base,
            direction: voucher.voucherType === "receipt" ? "in" : "out",
            account: names.get(voucher.accountId) ?? "A closed account",
            party:
              voucher.voucherType === "transfer"
                ? voucher.toAccountId == null
                  ? null
                  : (names.get(voucher.toAccountId) ?? "A closed account")
                : voucher.counterpartyName,
          });
        if (
          voucher.voucherType === "transfer" &&
          voucher.toAccountId != null &&
          inScope.has(voucher.toAccountId)
        )
          rows.push({
            ...base,
            direction: "in",
            account: names.get(voucher.toAccountId) ?? "A closed account",
            party: names.get(voucher.accountId) ?? "A closed account",
          });
      }
      const closing = new Map(
        closings.map((row) => [row.accountId, row.amount]),
      );
      const balances: PettyCashReportAccount[] = accounts.map((account) => ({
        name: account.name,
        holder:
          account.holderMemberId == null
            ? "Former Team Member"
            : (members.get(account.holderMemberId)?.name ??
              "Former Team Member"),
        closing: closing.get(account.id) ?? 0n,
        pending: pending.reduce((total, voucher) => {
          if (voucher.accountId === account.id)
            return (
              total +
              (voucher.voucherType === "receipt"
                ? voucher.amount
                : -voucher.amount)
            );
          if (voucher.toAccountId === account.id) return total + voucher.amount;
          return total;
        }, 0n),
      }));
      return { vouchers: rows, accounts: balances };
    },

    async transactions(workspaceId, projectId, range) {
      const between = {
        gte: new Date(`${range.from}T00:00:00.000Z`),
        lte: new Date(`${range.to}T00:00:00.000Z`),
      };
      const [transactions, transfers] = await Promise.all([
        db.constructionFinanceTransaction.findMany({
          where: {
            workspaceId,
            projectId,
            deletedAt: null,
            transactionDate: between,
          },
          orderBy: [{ transactionDate: "asc" }, { number: "asc" }],
        }),
        db.constructionFinanceAccountTransfer.findMany({
          where: {
            workspaceId,
            projectId,
            deletedAt: null,
            transferDate: between,
          },
          orderBy: [{ transferDate: "asc" }, { number: "asc" }],
        }),
      ]);
      const [accounts, categories] = await Promise.all([
        accountNames(workspaceId, [
          ...transactions.map((row) => row.accountId),
          ...transfers.flatMap((row) => [row.fromAccountId, row.toAccountId]),
        ]),
        categoryNames(
          workspaceId,
          transactions.map((row) => row.paymentCategoryId),
        ),
      ]);
      return {
        transactions: transactions.map((row) => ({
          date: calendarDateFromDb(row.transactionDate),
          number: row.number,
          type: row.type,
          account: accounts.get(row.accountId) ?? "A removed account",
          category:
            row.paymentCategoryId == null
              ? null
              : (categories.get(row.paymentCategoryId) ?? null),
          mode: row.mode,
          reference: row.chequeNumber ?? row.reference,
          party: row.counterpartyName,
          amount: row.amount,
          status: row.approvalStatus,
          description: row.description,
        })),
        transfers: transfers.map((row) => ({
          date: calendarDateFromDb(row.transferDate),
          number: row.number,
          from: accounts.get(row.fromAccountId) ?? "A removed account",
          to: accounts.get(row.toAccountId) ?? "A removed account",
          mode: row.mode,
          reference: row.reference,
          amount: row.amount,
          status: row.approvalStatus,
          description: row.description,
        })),
      };
    },

    async partyPayments(workspaceId, projectId, filter) {
      const { partyType, range, partyId } = filter;
      if (partyId != null) await assertParty(workspaceId, partyType, partyId);
      const partyFilter =
        partyId == null
          ? Prisma.sql`TRUE`
          : Prisma.sql`party_id = ${partyId}::uuid`;
      const [sums, invoices, payments] = await Promise.all([
        db.$queryRaw<
          {
            partyId: string;
            opening: bigint;
            invoiced: bigint;
            paid: bigint;
            tds: bigint;
            writtenOff: bigint;
            closing: bigint;
          }[]
        >(Prisma.sql`
          SELECT party_id::text AS "partyId",
            COALESCE(SUM(amount) FILTER (WHERE entry_date < ${range.from}::date), 0)::bigint AS opening,
            COALESCE(SUM(amount) FILTER (WHERE kind = 'invoice'
              AND entry_date BETWEEN ${range.from}::date AND ${range.to}::date), 0)::bigint AS invoiced,
            COALESCE(-SUM(amount) FILTER (WHERE kind = 'payment'
              AND entry_date BETWEEN ${range.from}::date AND ${range.to}::date), 0)::bigint AS paid,
            COALESCE(-SUM(amount) FILTER (WHERE kind = 'tds'
              AND entry_date BETWEEN ${range.from}::date AND ${range.to}::date), 0)::bigint AS tds,
            COALESCE(-SUM(amount) FILTER (WHERE kind = 'write_off'
              AND entry_date BETWEEN ${range.from}::date AND ${range.to}::date), 0)::bigint AS "writtenOff",
            COALESCE(SUM(amount) FILTER (WHERE entry_date <= ${range.to}::date), 0)::bigint AS closing
          FROM construction_finance.party_entries
          WHERE workspace_id = ${workspaceId}
            AND party_type = ${partyType}::construction_finance.party_type
            AND project_id = ${projectId}::uuid
            AND ${partyFilter}
          GROUP BY party_id`),
        loadDueInvoices(db, workspaceId, {
          projectIds: [projectId],
          asOn: range.to,
          partyType,
          partyId,
          direction: "payable",
          dated: range,
        }),
        db.constructionFinancePartyPayment.findMany({
          where: {
            workspaceId,
            projectId,
            partyType,
            direction: "out",
            deletedAt: null,
            ...(partyId == null ? {} : { partyId }),
            paymentDate: {
              gte: new Date(`${range.from}T00:00:00.000Z`),
              lte: new Date(`${range.to}T00:00:00.000Z`),
            },
          },
          orderBy: [{ paymentDate: "asc" }, { number: "asc" }],
        }),
      ]);
      // Each invoice's TDS: its share of every payment allocated to it.
      const invoiceIds = invoices.map((invoice) => invoice.id);
      const allocations =
        invoiceIds.length === 0
          ? []
          : await db.$queryRaw<
              {
                invoiceId: string;
                amount: bigint;
                paymentAmount: bigint;
                paymentTds: bigint;
              }[]
            >(Prisma.sql`
              SELECT a.invoice_id::text AS "invoiceId", a.amount,
                p.amount AS "paymentAmount", p.tds_amount AS "paymentTds"
              FROM construction_finance.payment_allocations a
              JOIN construction_finance.party_payments p ON p.id = a.payment_id
              WHERE a.invoice_id = ANY(${invoiceIds}::uuid[])
                AND a.deleted_at IS NULL AND p.deleted_at IS NULL
                AND p.payment_date <= ${range.to}::date`);
      const tdsOf = new Map<string, bigint>();
      for (const allocation of allocations)
        tdsOf.set(
          allocation.invoiceId,
          (tdsOf.get(allocation.invoiceId) ?? 0n) +
            tdsShare(allocation.amount, {
              amount: allocation.paymentAmount,
              tdsAmount: allocation.paymentTds,
            }),
        );
      const ids = new Set<string>([
        ...sums.map((row) => row.partyId),
        ...invoices.map((row) => row.partyId),
        ...payments.map((row) => row.partyId),
        ...(partyId == null ? [] : [partyId]),
      ]);
      const names = await partyNames(
        db,
        financeDirectory,
        workspaceId,
        [...ids].map((id) => ({ partyType, partyId: id })),
      );
      const bySum = new Map(sums.map((row) => [row.partyId, row]));
      const parties: PartyReportParty[] = [...ids].map((id) => {
        const row = bySum.get(id);
        return {
          id,
          name: nameOfParty(names, { partyType, partyId: id }),
          opening: row?.opening ?? 0n,
          invoiced: row?.invoiced ?? 0n,
          paid: row?.paid ?? 0n,
          tds: row?.tds ?? 0n,
          writtenOff: row?.writtenOff ?? 0n,
          closing: row?.closing ?? 0n,
        };
      });
      const accounts = await accountNames(
        workspaceId,
        payments.map((payment) => payment.accountId),
      );
      return {
        parties,
        invoices: invoices.map((invoice): PartyReportInvoice => {
          const tds = tdsOf.get(invoice.id) ?? 0n;
          return {
            partyId: invoice.partyId,
            number: invoice.invoiceNumber,
            date: invoice.invoiceDate,
            dueDate: invoice.dueDate,
            amount: invoice.amount,
            tds,
            paid: invoice.allocated - tds,
            writtenOff: invoiceWrittenOff(invoice),
            balance: invoiceBalance(invoice),
          };
        }),
        payments: payments.map((payment) => ({
          partyId: payment.partyId,
          number: payment.number,
          date: calendarDateFromDb(payment.paymentDate),
          account: accounts.get(payment.accountId) ?? "A removed account",
          mode: payment.mode,
          reference: payment.chequeNumber ?? payment.reference,
          amount: payment.amount,
          tds: payment.tdsAmount,
        })),
      };
    },

    async otherExpenses(workspaceId, projectId, range) {
      const rows = await db.constructionFinanceOtherExpense.findMany({
        where: {
          workspaceId,
          projectId,
          deletedAt: null,
          expenseDate: {
            gte: new Date(`${range.from}T00:00:00.000Z`),
            lte: new Date(`${range.to}T00:00:00.000Z`),
          },
        },
        orderBy: [{ expenseDate: "asc" }, { number: "asc" }],
      });
      const [accounts, categories] = await Promise.all([
        accountNames(
          workspaceId,
          rows.map((row) => row.accountId),
        ),
        categoryNames(
          workspaceId,
          rows.map((row) => row.paymentCategoryId),
        ),
      ]);
      return rows.map((row) => ({
        date: calendarDateFromDb(row.expenseDate),
        number: row.number,
        category: categories.get(row.paymentCategoryId) ?? null,
        payee: row.payeeName,
        account: accounts.get(row.accountId) ?? "A removed account",
        mode: row.mode,
        reference: row.reference,
        amount: row.amount,
        status: row.approvalStatus,
        description: row.description,
      }));
    },

    async tds(workspaceId, filter) {
      if (filter.contractorId != null)
        await assertParty(workspaceId, "contractor", filter.contractorId);
      const payments = await db.constructionFinancePartyPayment.findMany({
        where: {
          workspaceId,
          partyType: "contractor",
          deletedAt: null,
          paymentDate: {
            gte: new Date(`${filter.range.from}T00:00:00.000Z`),
            lte: new Date(`${filter.range.to}T00:00:00.000Z`),
          },
          OR: [{ tdsAmount: { gt: 0n } }, { tdsSection: { not: null } }],
          ...(filter.contractorId == null
            ? {}
            : { partyId: filter.contractorId }),
          ...(filter.projectIds == null
            ? {}
            : { projectId: { in: filter.projectIds } }),
        },
        orderBy: [{ paymentDate: "asc" }, { number: "asc" }],
      });
      const contractorIds = [...new Set(payments.map((row) => row.partyId))];
      const [contractors, projects] = await Promise.all([
        contractorIds.length === 0
          ? []
          : db.constructionMastersContractor.findMany({
              where: { workspaceId, id: { in: contractorIds } },
              select: { id: true, name: true, pan: true },
            }),
        projectNames(
          workspaceId,
          payments.map((row) => row.projectId),
        ),
      ]);
      const byId = new Map(contractors.map((row) => [row.id, row]));
      return payments.map((row) => ({
        contractorId: row.partyId,
        contractor: byId.get(row.partyId)?.name ?? "A removed Contractor",
        pan: byId.get(row.partyId)?.pan ?? null,
        date: calendarDateFromDb(row.paymentDate),
        number: row.number,
        project:
          row.projectId == null ? null : (projects.get(row.projectId) ?? null),
        base: row.tdsBase,
        rate: row.tdsRate == null ? null : row.tdsRate.toFixed(2),
        tds: row.tdsAmount,
        // As the TDS ledger screen (`PartyQueries.tdsLedger`) says it.
        overridden:
          row.tdsSuggested != null && row.tdsSuggested !== row.tdsAmount,
      }));
    },

    async duePayments(workspaceId, filter) {
      const invoices = await loadDueInvoices(db, workspaceId, {
        projectIds: filter.projectIds,
        asOn: filter.asOn,
      });
      const dues = partyDues(invoices, filter.asOn);
      const names = await partyNames(db, financeDirectory, workspaceId, dues);
      return dues.map((due) => ({
        name: nameOfParty(names, due),
        partyType: due.partyType satisfies PartyType,
        direction: due.direction,
        invoiced: due.invoiced,
        paid: due.paid,
        writtenOff: due.writtenOff,
        due: due.due,
        ageing: due.ageing,
      }));
    },
  };
}
