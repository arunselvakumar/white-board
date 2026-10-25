"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  FolderKanban,
  LayoutGrid,
  type LucideIcon,
  Paperclip,
  ReceiptText,
} from "lucide-react";
import Link from "next/link";
import { Suspense, useState, useTransition } from "react";
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
import { FilterTabs } from "@repo/ui/components/filter-tabs";
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
import { formatPaise } from "@/components/money/money-input";
import { formatDate, localToday } from "@/components/payments/payment-format";
import {
  DateFilter,
  NO_DATE_FILTER,
  type DateFilterValue,
} from "@/components/procurement/purchase-requests/date-filter";
import { FilterSelect } from "@/components/procurement/purchase-requests/filter-select";
import { ReasonDialog } from "@/components/procurement/purchase-requests/reason-dialog";
import { VOUCHER_TYPES } from "@/src/finance/domain/petty-cash";
import { fieldForCode } from "@/lib/server-errors";
import { canInFinance, financeAccessQuery } from "@/src/queries/finance-access";
import { paymentCategoryOptionsQuery } from "@/src/queries/finance-lookups";
import {
  pettyCashVouchersQuery,
  useBulkDecideVouchers,
  type PettyCashAccount,
  type PettyCashVoucher,
  type VoucherFilters,
  type VoucherType,
} from "@/src/queries/finance-petty-cash";
import type { ApprovalStatus } from "@/src/shared-kernel/approval";

import {
  APPROVAL_LABELS,
  Amount,
  VOUCHER_TYPE_LABELS,
  VoucherStatusBadge,
  pettyCashPath,
  voucherParty,
  voucherSign,
  voucherSummary,
} from "./petty-cash-parts";
import { VOUCHER_COLUMNS, VoucherRowsSkeleton } from "./petty-cash-skeletons";

type Scope = "project" | "all";

type Filters = {
  scope: Scope;
  date: DateFilterValue;
  type: VoucherType | "";
  status: ApprovalStatus | "";
  paymentCategoryId: string;
};

const SCOPE_TABS: { value: Scope; label: string; icon: LucideIcon }[] = [
  { value: "project", label: "This Project", icon: FolderKanban },
  { value: "all", label: "All Projects", icon: LayoutGrid },
];

const NO_FILTERS: Filters = {
  scope: "project",
  date: NO_DATE_FILTER,
  type: "",
  status: "",
  paymentCategoryId: "",
};

function toQuery(
  projectId: string,
  accountId: string,
  filters: Filters,
): VoucherFilters {
  return {
    accountId,
    projectId: filters.scope === "project" ? projectId : null,
    from: filters.date.from,
    to: filters.date.to,
    type: filters.type,
    status: filters.status,
    paymentCategoryId: filters.paymentCategoryId,
  };
}

function signedAmount(voucher: PettyCashVoucher) {
  return (
    <Amount
      paise={voucherSign(voucher.voucherType) * voucher.amount}
      signed
      className="font-medium"
    />
  );
}

function Files({ voucher }: { voucher: PettyCashVoucher }) {
  if (voucher.fileCount === 0) return null;
  return (
    <span
      className="text-muted-foreground inline-flex items-center gap-0.5 text-xs"
      title={`${String(voucher.fileCount)} files`}
    >
      <Paperclip aria-hidden="true" className="size-3" />
      {voucher.fileCount}
      <span className="sr-only"> files</span>
    </span>
  );
}

function VoucherRows({
  projectId,
  account,
  filters,
  cursor,
  bulk,
  canApprove,
  canReject,
  canCreate,
  onPage,
}: {
  projectId: string;
  account: PettyCashAccount;
  filters: Filters;
  cursor: VoucherFilters["cursor"];
  bulk: boolean;
  canApprove: boolean;
  canReject: boolean;
  canCreate: boolean;
  onPage: (cursor: VoucherFilters["cursor"]) => void;
}) {
  const { data } = useSuspenseQuery(
    pettyCashVouchersQuery({
      ...toQuery(projectId, account.id, filters),
      cursor,
    }),
  );
  const decide = useBulkDecideVouchers();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const filtered =
    JSON.stringify({ ...filters, scope: "project" }) !==
    JSON.stringify(NO_FILTERS);
  const selectable = (voucher: PettyCashVoucher) =>
    voucher.approvalStatus === "pending" &&
    (voucher.actions.approve || voucher.actions.reject);
  const chosen = data.items.filter(
    (voucher) => selected.has(voucher.id) && selectable(voucher),
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
        ids: chosen.map((voucher) => voucher.id),
        approve,
        ...(reason == null ? {} : { reason }),
      });
      setSelected(new Set());
      setNotice(
        `${String(result.decided)} ${result.decided === 1 ? "voucher" : "vouchers"} ${approve ? "approved" : "rejected"}.`,
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
            {filtered
              ? "No vouchers match"
              : filters.scope === "project"
                ? "No vouchers on this Project"
                : "No vouchers yet"}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try another date, type, status or category."
              : filters.scope === "project"
                ? "No voucher of this account is on this Project. Show All Projects, or write one."
                : "Write a Payment, Receipt or Transfer voucher for each cash movement."}
          </EmptyDescription>
        </EmptyHeader>
        {!filtered && canCreate ? (
          <EmptyContent>
            <Link
              href={pettyCashPath(
                projectId,
                `/new?account=${encodeURIComponent(account.id)}`,
              )}
              className={buttonVariants({ size: "sm" })}
            >
              New voucher
            </Link>
          </EmptyContent>
        ) : null}
      </Empty>
    );

  const check = (voucher: PettyCashVoucher) =>
    bulk ? (
      <Checkbox
        aria-label={`Select ${voucher.number}`}
        disabled={!selectable(voucher)}
        checked={selected.has(voucher.id)}
        onCheckedChange={(on) => {
          toggle(voucher.id, on);
        }}
      />
    ) : null;
  const href = (voucher: PettyCashVoucher) =>
    pettyCashPath(projectId, `/${voucher.id}`);

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {data.total} {data.total === 1 ? "voucher" : "vouchers"} · Payments{" "}
        {formatPaise(data.totals.payment)} · Receipts{" "}
        {formatPaise(data.totals.receipt)} · Transfers{" "}
        {formatPaise(data.totals.transfer)}
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
            {chosen.length} selected · only pending vouchers can be decided
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
        <Table aria-label="Vouchers">
          <TableHeader>
            <TableRow>
              {bulk && (
                <TableHead className="w-10">
                  <span className="sr-only">Select</span>
                </TableHead>
              )}
              {VOUCHER_COLUMNS.map((column, index) => (
                <TableHead key={index} className={column.className}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((voucher) => (
              <TableRow key={voucher.id}>
                {bulk && <TableCell>{check(voucher)}</TableCell>}
                <TableCell className="max-w-56">
                  <Link
                    href={href(voucher)}
                    className="font-medium whitespace-nowrap hover:underline"
                  >
                    {voucher.number}
                  </Link>
                  <div className="text-muted-foreground flex items-center gap-2 truncate text-xs">
                    {voucherSummary(voucher)}
                    <Files voucher={voucher} />
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(voucher.voucherDate)}
                </TableCell>
                <TableCell className="max-w-56">
                  <div className="truncate">{voucherParty(voucher)}</div>
                  {voucher.paidFor != null && (
                    <div className="text-muted-foreground truncate text-xs">
                      {voucher.paidFor}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-40 truncate">
                  {voucher.projectName ?? "—"}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {signedAmount(voucher)}
                </TableCell>
                <TableCell>
                  <VoucherStatusBadge status={voucher.approvalStatus} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul aria-label="Vouchers" className="space-y-2 md:hidden">
        {data.items.map((voucher) => (
          <li key={voucher.id} className="rounded-lg border p-3">
            <div className="flex items-start gap-3">
              {check(voucher)}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={href(voucher)}
                    className="font-medium hover:underline"
                  >
                    {voucher.number}
                  </Link>
                  {signedAmount(voucher)}
                </div>
                <p className="text-muted-foreground text-xs">
                  {formatDate(voucher.voucherDate)} · {voucherSummary(voucher)}
                </p>
                <p className="mt-1 truncate text-sm">{voucherParty(voucher)}</p>
                <div className="mt-2 flex items-center gap-2">
                  <VoucherStatusBadge status={voucher.approvalStatus} />
                  <Files voucher={voucher} />
                </div>
              </div>
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
        title={`Reject ${String(chosen.length)} ${chosen.length === 1 ? "voucher" : "vouchers"}?`}
        description="All of them are rejected with this reason, or none is."
        action="Reject"
        onSubmit={(reason) => bulkDecide(false, reason)}
      />
    </div>
  );
}

/**
 * One petty-cash account's vouchers, newest first (CM-703): on this
 * Project or on all Projects, by date, type, status and Payment Category;
 * bulk approve / reject (all or none) for approvers.
 */
export function PettyCashVouchers({
  projectId,
  account,
  canCreate,
  today = localToday(),
}: {
  projectId: string;
  account: PettyCashAccount;
  canCreate: boolean;
  today?: string;
}) {
  const { data: access } = useSuspenseQuery(financeAccessQuery(projectId));
  const categories = useQuery(paymentCategoryOptionsQuery()).data?.items ?? [];
  const may = (flag: "approve" | "reject") =>
    canInFinance(access, "finance.petty_cash", flag);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [cursor, setCursor] = useState<VoucherFilters["cursor"]>(null);
  const [bulk, setBulk] = useState(false);
  const [updating, startTransition] = useTransition();
  const change = (next: Partial<Filters>) => {
    startTransition(() => {
      setFilters((current) => ({ ...current, ...next }));
      setCursor(null);
    });
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterTabs
          aria-label="Projects"
          items={SCOPE_TABS}
          value={filters.scope}
          onValueChange={(next) => {
            change({ scope: next });
          }}
        />
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
      </div>
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <DateFilter
          idPrefix="vouchers"
          value={filters.date}
          today={today}
          onChange={(date) => {
            change({ date });
          }}
        />
        <FilterSelect
          id="vouchers-type"
          label="Type"
          allLabel="Any type"
          value={filters.type}
          options={VOUCHER_TYPES.map((type) => ({
            value: type,
            label: VOUCHER_TYPE_LABELS[type],
          }))}
          onChange={(type) => {
            change({ type: type as VoucherType | "" });
          }}
        />
        <FilterSelect
          id="vouchers-status"
          label="Status"
          allLabel="Any status"
          value={filters.status}
          options={(["pending", "approved", "rejected"] as const).map(
            (status) => ({ value: status, label: APPROVAL_LABELS[status] }),
          )}
          onChange={(status) => {
            change({ status: status as ApprovalStatus | "" });
          }}
        />
        <FilterSelect
          id="vouchers-category"
          label="Category"
          allLabel="Any category"
          value={filters.paymentCategoryId}
          options={categories.map((category) => ({
            value: category.id,
            label: category.name,
          }))}
          onChange={(paymentCategoryId) => {
            change({ paymentCategoryId });
          }}
        />
      </div>
      <div className={cn(updating && "opacity-60 transition-opacity")}>
        <Suspense fallback={<VoucherRowsSkeleton />}>
          <VoucherRows
            projectId={projectId}
            account={account}
            filters={filters}
            cursor={cursor}
            bulk={bulk}
            canApprove={may("approve")}
            canReject={may("reject")}
            canCreate={canCreate}
            onPage={(next) => {
              startTransition(() => {
                setCursor(next);
              });
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}
