"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Plus, ShoppingCart } from "lucide-react";
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
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import { FormAlert } from "@/components/auth/form-alert";
import {
  formatDate,
  localToday,
  money,
} from "@/components/payments/payment-format";
import {
  DateFilter,
  NO_DATE_FILTER,
  type DateFilterValue,
} from "@/components/procurement/purchase-requests/date-filter";
import { FilterSelect } from "@/components/procurement/purchase-requests/filter-select";
import { ReasonDialog } from "@/components/procurement/purchase-requests/reason-dialog";
import { fieldForCode } from "@/lib/server-errors";
import {
  canIn,
  procurementAccessQuery,
} from "@/src/queries/procurement-access";
import {
  purchaseOrdersQuery,
  useBulkDecidePurchaseOrders,
  type PurchaseOrder,
  type PurchaseOrderFilter,
} from "@/src/queries/purchase-orders";

import { PurchaseOrderActions } from "./purchase-order-actions";
import {
  purchaseOrdersPath,
  RECEIPT_LABELS,
  ReceiptBadge,
  StageBadge,
} from "./purchase-order-format";

const APPROVAL_CHIPS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
] as const;

type Chip = (typeof APPROVAL_CHIPS)[number]["key"];

type Filters = {
  date: DateFilterValue;
  approval: Chip;
  receiptStatus: string;
  supplierId: string;
};

const NO_FILTERS: Filters = {
  date: NO_DATE_FILTER,
  approval: "all",
  receiptStatus: "",
  supplierId: "",
};

/**
 * A Project's Purchase Orders (CM-504): filters by date, approval, receipt
 * status and Supplier; both statuses on every row; bulk approval mode.
 * Amounts are always shown (the menu has no Financial flag).
 */
export function PurchaseOrdersPage({
  projectId,
  today = localToday(),
}: {
  projectId: string;
  today?: string;
}) {
  const access = useQuery(procurementAccessQuery(projectId)).data;
  const may = (flag: Parameters<typeof canIn>[2]) =>
    access != null && canIn(access, "procurement.purchase_orders", flag);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [cursor, setCursor] = useState<PurchaseOrderFilter["cursor"]>(null);
  const [bulk, setBulk] = useState(false);
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
        <h2 className="text-lg font-semibold">Purchase Orders</h2>
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
            <Link
              href={purchaseOrdersPath(projectId, "/new")}
              className={buttonVariants({ size: "sm" })}
            >
              <Plus aria-hidden="true" />
              Add Purchase Order
            </Link>
          )}
        </div>
      </div>
      <ToggleGroup
        aria-label="Approval"
        value={[filters.approval]}
        onValueChange={(value: string[]) => {
          const next = value[0] as Chip | undefined;
          if (next != null) change({ approval: next });
        }}
        variant="outline"
        size="sm"
        className="flex-wrap"
      >
        {APPROVAL_CHIPS.map((chip) => (
          <ToggleGroupItem key={chip.key} value={chip.key}>
            {chip.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Suspense
        fallback={
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        }
      >
        <PurchaseOrderRows
          projectId={projectId}
          today={today}
          filters={filters}
          cursor={cursor}
          bulk={bulk}
          canApprove={may("approve")}
          canReject={may("reject")}
          canCreate={may("create")}
          onFilters={change}
          onPage={(next) => {
            startTransition(() => {
              setCursor(next);
            });
          }}
        />
      </Suspense>
    </div>
  );
}

function PurchaseOrderRows({
  projectId,
  today,
  filters,
  cursor,
  bulk,
  canApprove,
  canReject,
  canCreate,
  onFilters,
  onPage,
}: {
  projectId: string;
  today: string;
  filters: Filters;
  cursor: PurchaseOrderFilter["cursor"];
  bulk: boolean;
  canApprove: boolean;
  canReject: boolean;
  canCreate: boolean;
  onFilters: (next: Partial<Filters>) => void;
  onPage: (cursor: PurchaseOrderFilter["cursor"]) => void;
}) {
  const { data } = useSuspenseQuery(
    purchaseOrdersQuery({
      projectId,
      from: filters.date.from,
      to: filters.date.to,
      ...(filters.approval === "all"
        ? {}
        : { approvalStatus: filters.approval }),
      ...(filters.receiptStatus === ""
        ? {}
        : {
            receiptStatus:
              filters.receiptStatus as PurchaseOrderFilter["receiptStatus"],
          }),
      supplierId: filters.supplierId,
      cursor,
    }),
  );
  const decide = useBulkDecidePurchaseOrders();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const selectable = (po: PurchaseOrder) => po.approvalStatus === "pending";
  const chosen = data.items.filter(
    (po) => selected.has(po.id) && selectable(po),
  );
  const bulkDecide = async (approve: boolean, reason?: string) => {
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await decide.mutateAsync({
        projectId,
        ids: chosen.map((po) => po.id),
        approve,
        reason,
      });
      setSelected(new Set());
      setNotice(
        `${String(result.decided)} ${result.decided === 1 ? "order" : "orders"} ${approve ? "approved" : "rejected"}.`,
      );
    } catch (failure) {
      throw new Error(fieldForCode(failure, {}).message, { cause: failure });
    }
  };

  const filterBar = (
    <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
      <DateFilter
        idPrefix="po"
        value={filters.date}
        today={today}
        onChange={(date) => {
          onFilters({ date });
        }}
      />
      <FilterSelect
        id="po-receipt"
        label="Receipt status"
        value={filters.receiptStatus}
        options={Object.entries(RECEIPT_LABELS).map(([value, label]) => ({
          value,
          label,
        }))}
        onChange={(receiptStatus) => {
          onFilters({ receiptStatus });
        }}
      />
      <FilterSelect
        id="po-supplier"
        label="Supplier"
        value={filters.supplierId}
        options={data.facets.suppliers.map((item) => ({
          value: item.id,
          label: item.name,
        }))}
        onChange={(supplierId) => {
          onFilters({ supplierId });
        }}
      />
    </div>
  );

  if (data.items.length === 0)
    return (
      <div className="space-y-4">
        {filterBar}
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShoppingCart />
            </EmptyMedia>
            <EmptyTitle>
              {filtered ? "No Purchase Orders match" : "No Purchase Orders yet"}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Try another status, date or Supplier."
                : "Order materials from a Supplier on this Project, from scratch or from an approved Purchase Request."}
            </EmptyDescription>
          </EmptyHeader>
          {!filtered && canCreate && (
            <EmptyContent>
              <Link
                href={purchaseOrdersPath(projectId, "/new")}
                className={buttonVariants({ size: "sm" })}
              >
                Add Purchase Order
              </Link>
            </EmptyContent>
          )}
        </Empty>
      </div>
    );

  const check = (po: PurchaseOrder) =>
    bulk ? (
      <Checkbox
        aria-label={`Select ${po.number}`}
        disabled={!selectable(po)}
        checked={selected.has(po.id)}
        onCheckedChange={(on) => {
          setSelected((current) => {
            const next = new Set(current);
            if (on) next.add(po.id);
            else next.delete(po.id);
            return next;
          });
        }}
      />
    ) : null;

  return (
    <div className="space-y-3">
      {filterBar}
      <p className="text-muted-foreground text-sm">
        {data.total} {data.total === 1 ? "Purchase Order" : "Purchase Orders"}
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
            {chosen.length} selected · only pending orders can be decided
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
      <div className="hidden rounded-lg border md:block">
        <Table aria-label="Purchase Orders">
          <TableHeader>
            <TableRow>
              {bulk && (
                <TableHead className="w-10">
                  <span className="sr-only">Select</span>
                </TableHead>
              )}
              <TableHead>Number</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Expected</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((po) => (
              <TableRow key={po.id}>
                {bulk && <TableCell>{check(po)}</TableCell>}
                <TableCell className="font-medium whitespace-nowrap">
                  <Link
                    href={purchaseOrdersPath(projectId, `/${po.id}`)}
                    className="hover:underline"
                  >
                    {po.number}
                  </Link>
                  {po.purchaseRequest?.number != null && (
                    <p className="text-muted-foreground text-xs">
                      {po.purchaseRequest.number}
                    </p>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(po.orderDate)}
                </TableCell>
                <TableCell>{po.supplier.name}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(po.expectedDeliveryDate)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <StageBadge stage={po.stage} />
                    <ReceiptBadge po={po} />
                  </div>
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {money(po.totals.grandTotal)}
                </TableCell>
                <TableCell>
                  <PurchaseOrderActions
                    po={po}
                    projectId={projectId}
                    variant="menu"
                    onError={setError}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul aria-label="Purchase Orders" className="space-y-2 md:hidden">
        {data.items.map((po) => (
          <li key={po.id} className="rounded-lg border p-3">
            <div className="flex items-start gap-3">
              {check(po)}
              <div className="min-w-0 flex-1">
                <Link
                  href={purchaseOrdersPath(projectId, `/${po.id}`)}
                  className="font-medium hover:underline"
                >
                  {po.number}
                </Link>
                <p className="text-muted-foreground truncate text-xs">
                  {formatDate(po.orderDate)} · {po.supplier.name}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <StageBadge stage={po.stage} />
                  <ReceiptBadge po={po} />
                  <span className="ml-auto font-semibold tabular-nums">
                    {money(po.totals.grandTotal)}
                  </span>
                </div>
              </div>
              <PurchaseOrderActions
                po={po}
                projectId={projectId}
                variant="menu"
                onError={setError}
              />
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
        title={`Reject ${String(chosen.length)} ${chosen.length === 1 ? "order" : "orders"}?`}
        description="All of them are rejected with this reason, or none is."
        action="Reject"
        onSubmit={(reason) => bulkDecide(false, reason)}
      />
    </div>
  );
}
