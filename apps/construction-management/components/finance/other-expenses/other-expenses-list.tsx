"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Plus, ReceiptText } from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import { FormAlert } from "@/components/auth/form-alert";
import { accountLabel } from "@/components/finance/account-picker";
import { formatDate, money } from "@/components/payments/payment-format";
import { ReasonDialog } from "@/components/procurement/purchase-requests/reason-dialog";
import { fieldForCode } from "@/lib/server-errors";
import { canInFinance, financeAccessQuery } from "@/src/queries/finance-access";
import { accountOptionsQuery } from "@/src/queries/finance-accounts";
import { paymentCategoryOptionsQuery } from "@/src/queries/finance-lookups";
import {
  NO_EXPENSE_FILTERS,
  otherExpensesPath,
  otherExpensesQuery,
  useBulkDecideOtherExpenses,
  type OtherExpense,
  type OtherExpenseCursor,
  type OtherExpenseFilters,
} from "@/src/queries/finance-other-expenses";

import {
  ExpenseStatusBadge,
  modeText,
  STATUS_LABELS,
} from "./other-expense-parts";

const ALL = "all";

function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
  allLabel,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  allLabel: string;
}) {
  const items = [{ value: ALL, label: allLabel }, ...options];
  return (
    <div className="min-w-0 space-y-1.5 sm:w-48">
      <Label htmlFor={id}>{label}</Label>
      <Select
        items={items}
        value={value === "" ? ALL : value}
        onValueChange={(next) => {
          if (typeof next === "string") onChange(next === ALL ? "" : next);
        }}
      >
        <SelectTrigger id={id} className="w-full min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * A Project's Other Expenses (CM-704, ADR CM-0017 §10): filters by date
 * range, Payment Category, account and status; the approved and pending
 * totals; bulk approve / reject for members with Approve or Reject.
 */
export function OtherExpensesList({ projectId }: { projectId: string }) {
  const access = useQuery(financeAccessQuery(projectId));
  const can = (flag: "create" | "approve" | "reject") =>
    access.data != null &&
    canInFinance(access.data, "finance.other_expenses", flag);
  const categories = useQuery(paymentCategoryOptionsQuery());
  const accounts = useQuery(accountOptionsQuery());
  const [filters, setFilters] =
    useState<OtherExpenseFilters>(NO_EXPENSE_FILTERS);
  const [cursor, setCursor] = useState<OtherExpenseCursor>(null);
  const [bulk, setBulk] = useState(false);
  const update = (next: Partial<OtherExpenseFilters>) => {
    setFilters((current) => ({ ...current, ...next }));
    setCursor(null);
  };
  const newHref = can("create") ? otherExpensesPath(projectId, "/new") : null;

  return (
    <div className="w-full min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Other Expenses</h2>
          <p className="text-muted-foreground text-sm">
            Project spend with no party bill. Only approved expenses leave the
            account.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(can("approve") || can("reject")) && (
            <Button
              type="button"
              size="sm"
              variant={bulk ? "secondary" : "outline"}
              aria-pressed={bulk}
              onClick={() => {
                setBulk((current) => !current);
              }}
            >
              {bulk ? "Exit bulk approval" : "Bulk approval"}
            </Button>
          )}
          {newHref != null && (
            <Link href={newHref} className={buttonVariants({ size: "sm" })}>
              <Plus aria-hidden="true" />
              Add Other Expense
            </Link>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <div className="min-w-0 space-y-1.5 sm:w-40">
          <Label htmlFor="expenses-from">From</Label>
          <Input
            id="expenses-from"
            type="date"
            value={filters.from}
            onChange={(event) => {
              update({ from: event.target.value });
            }}
          />
        </div>
        <div className="min-w-0 space-y-1.5 sm:w-40">
          <Label htmlFor="expenses-to">To</Label>
          <Input
            id="expenses-to"
            type="date"
            value={filters.to}
            onChange={(event) => {
              update({ to: event.target.value });
            }}
          />
        </div>
        <FilterSelect
          id="expenses-category"
          label="Payment Category"
          allLabel="All categories"
          value={filters.paymentCategoryId}
          options={(categories.data?.items ?? []).map((item) => ({
            value: item.id,
            label: item.name,
          }))}
          onChange={(paymentCategoryId) => {
            update({ paymentCategoryId });
          }}
        />
        <FilterSelect
          id="expenses-account"
          label="Paid from"
          allLabel="All accounts"
          value={filters.accountId}
          options={(accounts.data?.items ?? []).map((item) => ({
            value: item.id,
            label: accountLabel(item),
          }))}
          onChange={(accountId) => {
            update({ accountId });
          }}
        />
        <FilterSelect
          id="expenses-status"
          label="Status"
          allLabel="All"
          value={filters.status}
          options={(["pending", "approved", "rejected"] as const).map(
            (status) => ({ value: status, label: STATUS_LABELS[status] }),
          )}
          onChange={(status) => {
            update({ status: status as OtherExpenseFilters["status"] });
          }}
        />
      </div>
      <Suspense
        fallback={
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        }
      >
        <ExpenseRows
          projectId={projectId}
          filters={filters}
          cursor={cursor}
          bulk={bulk}
          canApprove={can("approve")}
          canReject={can("reject")}
          newHref={newHref}
          onPage={setCursor}
        />
      </Suspense>
    </div>
  );
}

function ExpenseRows({
  projectId,
  filters,
  cursor,
  bulk,
  canApprove,
  canReject,
  newHref,
  onPage,
}: {
  projectId: string;
  filters: OtherExpenseFilters;
  cursor: OtherExpenseCursor;
  bulk: boolean;
  canApprove: boolean;
  canReject: boolean;
  newHref: string | null;
  onPage: (cursor: OtherExpenseCursor) => void;
}) {
  const { data } = useSuspenseQuery(
    otherExpensesQuery(projectId, filters, cursor),
  );
  const decide = useBulkDecideOtherExpenses();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const filtered =
    JSON.stringify(filters) !== JSON.stringify(NO_EXPENSE_FILTERS);
  const selectable = (expense: OtherExpense) => expense.status === "pending";
  const chosen = data.items.filter(
    (expense) => selected.has(expense.id) && selectable(expense),
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
        projectId,
        ids: chosen.map((expense) => expense.id),
        approve,
        reason,
      });
      setSelected(new Set());
      setNotice(
        `${String(result.decided)} ${result.decided === 1 ? "expense" : "expenses"} ${approve ? "approved" : "rejected"}.`,
      );
    } catch (failure) {
      throw new Error(fieldForCode(failure, {}).message, { cause: failure });
    }
  };

  if (data.items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ReceiptText />
          </EmptyMedia>
          <EmptyTitle>
            {filtered ? "No expenses match" : "No Other Expenses yet"}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try another date range, category, account or status."
              : "Record what the site spends without a party bill: tea, transport, small tools, site office bills."}
          </EmptyDescription>
        </EmptyHeader>
        {!filtered && newHref != null && (
          <EmptyContent>
            <Link href={newHref} className={buttonVariants({ size: "sm" })}>
              <Plus aria-hidden="true" />
              Add Other Expense
            </Link>
          </EmptyContent>
        )}
      </Empty>
    );

  const check = (expense: OtherExpense) =>
    bulk ? (
      <Checkbox
        aria-label={`Select ${expense.number}`}
        disabled={!selectable(expense)}
        checked={selected.has(expense.id)}
        onCheckedChange={(on) => {
          toggle(expense.id, on);
        }}
      />
    ) : null;

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {data.total} {data.total === 1 ? "expense" : "expenses"} ·{" "}
        {money(data.totals.amount)}
        {/* The total counts pending and rejected expenses too; say what
            actually left the account whenever the two differ. */}
        {data.totals.approved !== data.totals.amount && (
          <> · Approved {money(data.totals.approved)}</>
        )}
        {data.totals.pending > 0 && (
          <> · Pending {money(data.totals.pending)}</>
        )}
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
            {chosen.length} selected · only pending expenses can be decided
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
                      failure instanceof Error
                        ? failure.message
                        : "Something went wrong.",
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
      <div className="hidden rounded-lg border md:block">
        <Table aria-label="Other Expenses">
          <TableHeader>
            <TableRow>
              {bulk && (
                <TableHead className="w-10">
                  <span className="sr-only">Select</span>
                </TableHead>
              )}
              <TableHead>Expense</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Paid to</TableHead>
              <TableHead>Paid from</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((expense) => (
              <TableRow key={expense.id}>
                {bulk && <TableCell>{check(expense)}</TableCell>}
                <TableCell>
                  <Link
                    href={otherExpensesPath(projectId, `/${expense.id}`)}
                    className="font-medium hover:underline"
                  >
                    {expense.number}
                  </Link>
                  <p className="text-muted-foreground text-xs">
                    {formatDate(expense.expenseDate)}
                  </p>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {expense.paymentCategory.name}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-40 truncate">
                  {expense.payeeName ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-48">
                  <p className="truncate">{expense.account.name}</p>
                  <p className="truncate text-xs">{modeText(expense)}</p>
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {money(expense.amount)}
                </TableCell>
                <TableCell>
                  <ExpenseStatusBadge status={expense.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul aria-label="Other Expenses" className="space-y-2 md:hidden">
        {data.items.map((expense) => (
          <li
            key={expense.id}
            className="bg-card flex items-start gap-3 rounded-lg border p-3"
          >
            {bulk && <div className="pt-0.5">{check(expense)}</div>}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={otherExpensesPath(projectId, `/${expense.id}`)}
                    className="block truncate font-medium hover:underline"
                  >
                    {expense.number}
                  </Link>
                  <p className="text-muted-foreground truncate text-xs">
                    {formatDate(expense.expenseDate)} ·{" "}
                    {expense.paymentCategory.name}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold tabular-nums">
                    {money(expense.amount)}
                  </p>
                  <ExpenseStatusBadge status={expense.status} />
                </div>
              </div>
              <p className="text-muted-foreground mt-1 truncate text-xs">
                {expense.payeeName == null ? "" : `${expense.payeeName} · `}
                {expense.account.name} · {modeText(expense)}
              </p>
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
        title={`Reject ${String(chosen.length)} ${chosen.length === 1 ? "expense" : "expenses"}?`}
        description="All of them are rejected with this reason, or none is."
        action="Reject"
        onSubmit={(reason) => bulkDecide(false, reason)}
      />
    </div>
  );
}
