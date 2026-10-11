"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeftRight, FileUp, Plus, Receipt } from "lucide-react";
import Link from "next/link";
import { Suspense, useState, useTransition } from "react";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { cn } from "@repo/ui/lib/utils";

import { FormAlert } from "@/components/auth/form-alert";
import { accountLabel } from "@/components/finance/account-picker";
import { COUNTERPARTY_KIND_LABELS } from "@/components/finance/counterparty-field";
import { formatPaise } from "@/components/money/money-input";
import { formatDate, localToday } from "@/components/payments/payment-format";
import {
  DateFilter,
  NO_DATE_FILTER,
  type DateFilterValue,
} from "@/components/procurement/purchase-requests/date-filter";
import { FilterSelect } from "@/components/procurement/purchase-requests/filter-select";
import { ReasonDialog } from "@/components/procurement/purchase-requests/reason-dialog";
import { fieldForCode } from "@/lib/server-errors";
import { canInFinance, financeAccessQuery } from "@/src/queries/finance-access";
import { accountOptionsQuery } from "@/src/queries/finance-accounts";
import { paymentCategoryOptionsQuery } from "@/src/queries/finance-lookups";
import {
  transactionsQuery,
  useBulkDecideTransactions,
  type RegisterItem,
  type TransactionFilter,
} from "@/src/queries/finance-transactions";

import { ImportTransactionsDialog } from "./import-transactions-dialog";
import { TransactionActions } from "./transaction-actions";
import { TransactionDialog } from "./transaction-form";
import {
  ApprovalChip,
  itemAccounts,
  itemDate,
  itemKind,
  itemMode,
  itemParty,
  itemPath,
  MODE_LABELS,
  MODES,
  STATUS_LABELS,
} from "./transaction-format";
import { TransferDialog } from "./transfer-form";

const MENU = "finance.transactions";

type Filters = {
  date: DateFilterValue;
  type: "" | "in" | "out" | "transfer";
  accountId: string;
  paymentCategoryId: string;
  mode: string;
  counterpartyKind: string;
  approvalStatus: string;
};

const NO_FILTERS: Filters = {
  date: NO_DATE_FILTER,
  type: "",
  accountId: "",
  paymentCategoryId: "",
  mode: "",
  counterpartyKind: "",
  approvalStatus: "",
};

/** The dialog open on the page: a new or edited Transaction or transfer. */
export type Editing =
  | { kind: "transaction"; item: RegisterItem | null }
  | { kind: "transfer"; item: RegisterItem | null }
  | null;

/**
 * A Project's Transactions (CM-702): Payment In, Payment Out and transfers
 * with filters (date, type, account, category, mode, party, status), the
 * in / out totals of what is listed, bulk approve / reject, New
 * transaction, Transfer and Import. Actions follow the viewer's flags.
 */
export function TransactionsPage({
  projectId,
  today = localToday(),
}: {
  projectId: string;
  today?: string;
}) {
  const access = useQuery(financeAccessQuery(projectId)).data;
  const may = (flag: "create" | "approve" | "reject") =>
    access != null && canInFinance(access, MENU, flag);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [cursor, setCursor] = useState<TransactionFilter["cursor"]>(null);
  const [bulk, setBulk] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [importing, setImporting] = useState(false);
  const [, startTransition] = useTransition();
  const change = (next: Partial<Filters>) => {
    startTransition(() => {
      setFilters((current) => ({ ...current, ...next }));
      setCursor(null);
    });
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Transactions</h2>
        <div className="flex flex-wrap gap-2">
          {(may("approve") || may("reject")) && (
            <Button
              type="button"
              variant={bulk ? "secondary" : "outline"}
              size="sm"
              aria-pressed={bulk}
              onClick={() => {
                setBulk((current) => !current);
              }}
            >
              {bulk ? "Exit bulk approval" : "Bulk approval"}
            </Button>
          )}
          {may("create") && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setImporting(true);
                }}
              >
                <FileUp aria-hidden="true" />
                Import
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing({ kind: "transfer", item: null });
                }}
              >
                <ArrowLeftRight aria-hidden="true" />
                Transfer
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setEditing({ kind: "transaction", item: null });
                }}
              >
                <Plus aria-hidden="true" />
                New transaction
              </Button>
            </>
          )}
        </div>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <TransactionRows
          projectId={projectId}
          today={today}
          filters={filters}
          cursor={cursor}
          bulk={bulk}
          canApprove={may("approve")}
          canReject={may("reject")}
          canCreate={may("create")}
          onFilters={change}
          onEdit={setEditing}
          onPage={(next) => {
            startTransition(() => {
              setCursor(next);
            });
          }}
        />
      </Suspense>
      {editing?.kind === "transaction" ? (
        <TransactionDialog
          projectId={projectId}
          transaction={
            editing.item?.type === "transaction" ? editing.item : null
          }
          canApprove={may("approve")}
          today={today}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
      {editing?.kind === "transfer" ? (
        <TransferDialog
          projectId={projectId}
          transfer={editing.item?.type === "transfer" ? editing.item : null}
          canApprove={may("approve")}
          today={today}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
      <ImportTransactionsDialog
        projectId={projectId}
        open={importing}
        onClose={() => {
          setImporting(false);
        }}
      />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

function SignedRowAmount({ item }: { item: RegisterItem }) {
  const out = item.type === "transaction" && item.direction === "payment_out";
  const incoming =
    item.type === "transaction" && item.direction === "payment_in";
  return (
    <span
      className={cn(
        "tabular-nums",
        out && "text-destructive",
        incoming && "text-emerald-700 dark:text-emerald-400",
      )}
    >
      {out ? "−" : incoming ? "+" : ""}
      {formatPaise(item.amount)}
    </span>
  );
}

function TransactionRows({
  projectId,
  today,
  filters,
  cursor,
  bulk,
  canApprove,
  canReject,
  canCreate,
  onFilters,
  onEdit,
  onPage,
}: {
  projectId: string;
  today: string;
  filters: Filters;
  cursor: TransactionFilter["cursor"];
  bulk: boolean;
  canApprove: boolean;
  canReject: boolean;
  canCreate: boolean;
  onFilters: (next: Partial<Filters>) => void;
  onEdit: (editing: Editing) => void;
  onPage: (cursor: TransactionFilter["cursor"]) => void;
}) {
  const { data } = useSuspenseQuery(
    transactionsQuery({
      projectId,
      from: filters.date.from,
      to: filters.date.to,
      type: filters.type,
      accountId: filters.accountId,
      paymentCategoryId: filters.paymentCategoryId,
      mode: filters.mode,
      counterpartyKind: filters.counterpartyKind,
      approvalStatus: filters.approvalStatus,
      cursor,
    }),
  );
  const accounts = useQuery(accountOptionsQuery()).data?.items ?? [];
  const categories = useQuery(paymentCategoryOptionsQuery()).data?.items ?? [];
  const decide = useBulkDecideTransactions();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const selectable = (item: RegisterItem) => item.approvalStatus === "pending";
  const chosen = data.items.filter(
    (item) => selected.has(item.id) && selectable(item),
  );
  const toggle = (id: string, on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const bulkDecide = async (approve: boolean, reason?: string) => {
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await decide.mutateAsync({
        items: chosen.map((item) => ({ type: item.type, id: item.id })),
        approve,
        reason,
      });
      setSelected(new Set());
      setNotice(
        `${String(result.decided)} ${approve ? "approved" : "rejected"}.`,
      );
    } catch (failure) {
      throw new Error(fieldForCode(failure, {}).message, { cause: failure });
    }
  };

  const filterBar = (
    <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
      <DateFilter
        idPrefix="transactions"
        value={filters.date}
        today={today}
        onChange={(date) => {
          onFilters({ date });
        }}
      />
      <FilterSelect
        id="transactions-type"
        label="Type"
        value={filters.type}
        options={[
          { value: "in", label: "Payment In" },
          { value: "out", label: "Payment Out" },
          { value: "transfer", label: "Transfer" },
        ]}
        onChange={(type) => {
          onFilters({ type: type as Filters["type"] });
        }}
      />
      <FilterSelect
        id="transactions-account"
        label="Account"
        value={filters.accountId}
        options={accounts.map((account) => ({
          value: account.id,
          label: accountLabel(account),
        }))}
        onChange={(accountId) => {
          onFilters({ accountId });
        }}
      />
      <FilterSelect
        id="transactions-category"
        label="Category"
        value={filters.paymentCategoryId}
        options={categories.map((category) => ({
          value: category.id,
          label: category.name,
        }))}
        onChange={(paymentCategoryId) => {
          onFilters({ paymentCategoryId });
        }}
      />
      <FilterSelect
        id="transactions-mode"
        label="Mode"
        value={filters.mode}
        options={MODES.map((mode) => ({
          value: mode,
          label: MODE_LABELS[mode],
        }))}
        onChange={(mode) => {
          onFilters({ mode });
        }}
      />
      <FilterSelect
        id="transactions-party"
        label="Party"
        value={filters.counterpartyKind}
        options={Object.entries(COUNTERPARTY_KIND_LABELS).map(
          ([value, label]) => ({ value, label }),
        )}
        onChange={(counterpartyKind) => {
          onFilters({ counterpartyKind });
        }}
      />
      <FilterSelect
        id="transactions-status"
        label="Status"
        value={filters.approvalStatus}
        options={Object.entries(STATUS_LABELS).map(([value, label]) => ({
          value,
          label,
        }))}
        onChange={(approvalStatus) => {
          onFilters({ approvalStatus });
        }}
      />
    </div>
  );

  if (data.items.length === 0)
    return (
      <div className="space-y-4">
        {(filtered || data.total > 0) && filterBar}
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Receipt />
            </EmptyMedia>
            <EmptyTitle>
              {filtered ? "No Transactions match" : "No Transactions yet"}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Try another date, account or status."
                : "Record money in or out of an account that is not a party payment: bank charges, interest, the owner's capital, a token amount."}
            </EmptyDescription>
          </EmptyHeader>
          {!filtered && canCreate && (
            <EmptyContent>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onEdit({ kind: "transaction", item: null });
                }}
              >
                New transaction
              </Button>
            </EmptyContent>
          )}
        </Empty>
      </div>
    );

  const check = (item: RegisterItem) =>
    bulk ? (
      <Checkbox
        aria-label={`Select ${item.number}`}
        disabled={!selectable(item)}
        checked={selected.has(item.id)}
        onCheckedChange={(on) => {
          toggle(item.id, on);
        }}
      />
    ) : null;

  const actions = (item: RegisterItem) => (
    <TransactionActions
      projectId={projectId}
      item={item}
      variant="menu"
      onError={setError}
      onEdit={() => {
        onEdit({ kind: item.type, item });
      }}
    />
  );

  return (
    <div className="space-y-3">
      {filterBar}
      <section aria-label="Totals">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="bg-card min-w-0 rounded-lg border p-3">
            <dt className="text-muted-foreground text-xs">Payment In</dt>
            <dd className="truncate font-medium text-emerald-700 tabular-nums dark:text-emerald-400">
              {formatPaise(data.totals.in)}
            </dd>
          </div>
          <div className="bg-card min-w-0 rounded-lg border p-3">
            <dt className="text-muted-foreground text-xs">Payment Out</dt>
            <dd className="text-destructive truncate font-medium tabular-nums">
              {formatPaise(data.totals.out)}
            </dd>
          </div>
          <div className="bg-card min-w-0 rounded-lg border p-3">
            <dt className="text-muted-foreground text-xs">Net</dt>
            <dd className="truncate font-medium tabular-nums">
              {formatPaise(data.totals.in - data.totals.out)}
            </dd>
          </div>
          <div className="bg-card min-w-0 rounded-lg border p-3">
            <dt className="text-muted-foreground text-xs">Transferred</dt>
            <dd className="truncate font-medium tabular-nums">
              {formatPaise(data.totals.transfer)}
            </dd>
          </div>
        </dl>
      </section>
      <p className="text-muted-foreground text-sm">
        {data.total} {data.total === 1 ? "entry" : "entries"}
        {filters.approvalStatus === "rejected"
          ? ""
          : " · totals leave out rejected ones"}
      </p>
      <FormAlert message={error} />
      {notice != null && (
        <p
          role="status"
          className="text-sm text-emerald-700 dark:text-emerald-400"
        >
          {notice}
        </p>
      )}
      {bulk && (
        <div className="bg-muted/60 sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border p-2">
          <span className="text-sm">
            {chosen.length} selected · only pending ones can be decided
          </span>
          <div className="ml-auto flex gap-2">
            {canReject && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={chosen.length === 0 || decide.isPending}
                onClick={() => {
                  setRejecting(true);
                }}
              >
                Reject ({chosen.length})
              </Button>
            )}
            {canApprove && (
              <Button
                type="button"
                size="sm"
                disabled={chosen.length === 0 || decide.isPending}
                onClick={() => {
                  bulkDecide(true).catch((failure: unknown) => {
                    setError(
                      failure instanceof Error ? failure.message : undefined,
                    );
                  });
                }}
              >
                Approve ({chosen.length})
              </Button>
            )}
          </div>
        </div>
      )}
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table aria-label="Transactions">
          <TableHeader>
            <TableRow>
              {bulk && (
                <TableHead className="w-10">
                  <span className="sr-only">Select</span>
                </TableHead>
              )}
              <TableHead>Number</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Paid To / Received From</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item) => (
              <TableRow key={item.id}>
                {bulk && <TableCell>{check(item)}</TableCell>}
                <TableCell className="font-medium whitespace-nowrap">
                  <Link
                    href={itemPath(projectId, item)}
                    className="hover:underline"
                  >
                    {item.number}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(itemDate(item))}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {itemKind(item)}
                  <div className="text-muted-foreground text-xs">
                    {itemMode(item)}
                  </div>
                </TableCell>
                <TableCell className="max-w-56 truncate">
                  {itemAccounts(item)}
                </TableCell>
                <TableCell className="max-w-56">
                  <div className="truncate">{itemParty(item) ?? "—"}</div>
                  {item.type === "transaction" &&
                  item.paymentCategoryName != null ? (
                    <div className="text-muted-foreground truncate text-xs">
                      {item.paymentCategoryName}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <SignedRowAmount item={item} />
                </TableCell>
                <TableCell>
                  <ApprovalChip status={item.approvalStatus} />
                </TableCell>
                <TableCell>{actions(item)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul aria-label="Transactions" className="space-y-2 md:hidden">
        {data.items.map((item) => (
          <li key={item.id} className="rounded-lg border p-3">
            <div className="flex items-start gap-3">
              {check(item)}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={itemPath(projectId, item)}
                    className="truncate font-medium hover:underline"
                  >
                    {item.number}
                  </Link>
                  <SignedRowAmount item={item} />
                </div>
                <p className="text-muted-foreground text-xs">
                  {formatDate(itemDate(item))} · {itemKind(item)} ·{" "}
                  {itemMode(item)}
                </p>
                <p className="mt-1 truncate text-sm">{itemAccounts(item)}</p>
                {itemParty(item) != null ? (
                  <p className="text-muted-foreground truncate text-xs">
                    {itemParty(item)}
                  </p>
                ) : null}
                <div className="mt-2">
                  <ApprovalChip status={item.approvalStatus} />
                </div>
              </div>
              {actions(item)}
            </div>
          </li>
        ))}
      </ul>
      {(data.prevCursor != null || data.nextCursor != null) && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={data.prevCursor == null}
            onClick={() => {
              if (data.prevCursor != null) onPage({ before: data.prevCursor });
            }}
          >
            Newer
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={data.nextCursor == null}
            onClick={() => {
              if (data.nextCursor != null) onPage({ after: data.nextCursor });
            }}
          >
            Older
          </Button>
        </div>
      )}
      <ReasonDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title={`Reject ${String(chosen.length)} selected?`}
        description="All of them are rejected with this reason, or none is."
        action="Reject"
        onSubmit={(reason) => bulkDecide(false, reason)}
      />
    </div>
  );
}
