"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { FileInput, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense, useState, useTransition } from "react";
import { Button } from "@repo/ui/components/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { cn } from "@repo/ui/lib/utils";

import { FilterSelect } from "@/components/procurement/purchase-requests/filter-select";
import {
  BILL_STATUS_LABELS,
  BILL_STATUSES,
  type BillStatus,
} from "@/src/contracts/domain/contract-terms";
import {
  contractorBillFormOptionsQuery,
  contractorBillsPath,
  contractorBillsQuery,
  type ContractorBillFilters,
  type ContractorBillPage,
  type ContractorBillSummary,
} from "@/src/queries/contracts-contractor-bills";

import {
  BillStatusBadge,
  billNumber,
  dateText,
  moneyOrDash,
  raLabel,
} from "./contractor-bill-format";
import {
  CONTRACTOR_BILL_COLUMNS,
  ContractorBillRowsSkeleton,
} from "./contractor-bills-skeletons";
import { NewContractorBillDialog } from "./new-contractor-bill-dialog";

type Filters = Omit<ContractorBillFilters, "cursor">;

const NO_FILTERS: Filters = {
  status: "",
  workOrderId: "",
  contractorId: "",
  from: "",
  to: "",
};

function plural(n: number, word: string): string {
  return `${String(n)} ${n === 1 ? word : `${word}s`}`;
}

/**
 * Project → Contracts → **Contractor Bills** (CM-1106, ADR CM-0023 §7):
 * newest first, by status, Work Order or bill date, with the totals of
 * what is shown and the retention held per Contractor; cards at phone
 * width, a table above. Contractor Bill Create holders draft one.
 */
export function ContractorBillsList({
  projectId,
  canCreate,
  workOrderId = "",
}: {
  projectId: string;
  canCreate: boolean;
  /** Opened from a Work Order: filtered to it. */
  workOrderId?: string;
}) {
  const [filters, setFilters] = useState<Filters>({
    ...NO_FILTERS,
    workOrderId,
  });
  const [cursor, setCursor] = useState<ContractorBillFilters["cursor"]>(null);
  const [creating, setCreating] = useState(false);
  const [updating, startTransition] = useTransition();
  const change = (next: Partial<Filters>) => {
    startTransition(() => {
      setFilters((current) => ({ ...current, ...next }));
      setCursor(null);
    });
  };
  // Issued Work Orders for the filter; only bill creators may read the form's options.
  const workOrders =
    useQuery({
      ...contractorBillFormOptionsQuery(projectId),
      enabled: canCreate,
    }).data?.workOrders ?? [];
  return (
    <div className="flex w-full max-w-6xl min-w-0 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold">Contractor Bills</h2>
          <p className="text-muted-foreground text-sm">
            Running account bills from Contractors, measured against their Work
            Orders.
          </p>
        </div>
        {canCreate && (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setCreating(true);
            }}
          >
            <Plus aria-hidden="true" />
            New bill
          </Button>
        )}
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <FilterSelect
          id="bills-status"
          label="Status"
          allLabel="Every status"
          value={filters.status}
          options={BILL_STATUSES.map((status) => ({
            value: status,
            label: BILL_STATUS_LABELS[status],
          }))}
          onChange={(status) => {
            change({ status: status as BillStatus | "" });
          }}
        />
        {workOrders.length > 1 && (
          <FilterSelect
            id="bills-work-order"
            label="Work Order"
            allLabel="Every Work Order"
            value={filters.workOrderId}
            options={workOrders.map((order) => ({
              value: order.id,
              label: `${order.number ?? "Draft"} · ${order.contractorName}`,
            }))}
            onChange={(id) => {
              change({ workOrderId: id });
            }}
          />
        )}
        <div className="min-w-0 space-y-1">
          <Label htmlFor="bills-from" className="text-xs">
            From
          </Label>
          <Input
            id="bills-from"
            type="date"
            className="h-8 w-full sm:w-40"
            value={filters.from}
            onChange={(event) => {
              change({ from: event.target.value });
            }}
          />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor="bills-to" className="text-xs">
            To
          </Label>
          <Input
            id="bills-to"
            type="date"
            className="h-8 w-full sm:w-40"
            value={filters.to}
            onChange={(event) => {
              change({ to: event.target.value });
            }}
          />
        </div>
      </div>
      <div
        className={cn("min-w-0", updating && "opacity-60 transition-opacity")}
      >
        <Suspense fallback={<ContractorBillRowsSkeleton />}>
          <ContractorBillRows
            projectId={projectId}
            filters={filters}
            cursor={cursor}
            canCreate={canCreate}
            onCreate={() => {
              setCreating(true);
            }}
            onPage={(next) => {
              startTransition(() => {
                setCursor(next);
              });
            }}
          />
        </Suspense>
      </div>
      {canCreate ? (
        <NewContractorBillDialog
          projectId={projectId}
          open={creating}
          onOpenChange={setCreating}
        />
      ) : null}
    </div>
  );
}

function Totals({ data }: { data: ContractorBillPage }) {
  if (!data.financial || data.totals.count === 0) return null;
  const figures: [string, number | null][] = [
    ["Gross", data.totals.gross],
    ["GST", data.totals.gst],
    ["Deductions", data.totals.deductions],
    ["Net", data.totals.net],
  ];
  return (
    <section
      aria-label="Totals"
      className="grid min-w-0 grid-cols-2 gap-3 rounded-xl border p-3 sm:grid-cols-4"
    >
      {figures.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <p className="text-muted-foreground text-xs">{label}</p>
          <p className="text-sm font-semibold break-words tabular-nums">
            {moneyOrDash(value)}
          </p>
        </div>
      ))}
      <p className="text-muted-foreground col-span-2 text-xs sm:col-span-4">
        Over {plural(data.totals.count, "bill")} shown that count: drafts,
        pending and approved, not rejected or reversed.
      </p>
    </section>
  );
}

function RetentionHeld({ data }: { data: ContractorBillPage }) {
  if (data.retentionHeld.length === 0) return null;
  return (
    <section
      aria-labelledby="bills-retention-title"
      className="min-w-0 space-y-2 rounded-xl border p-3"
    >
      <h3 id="bills-retention-title" className="text-sm font-semibold">
        Retention held
      </h3>
      <ul className="space-y-1 text-sm">
        {data.retentionHeld.map((row) => (
          <li
            key={row.contractorId}
            className="flex min-w-0 flex-wrap justify-between gap-x-3"
          >
            <span className="min-w-0 break-words">{row.contractorName}</span>
            <span className="tabular-nums">{moneyOrDash(row.amount)}</span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs">
        On approved bills, not yet released. It is paid when released, not with
        the bills.
      </p>
    </section>
  );
}

function ContractorBillRows({
  projectId,
  filters,
  cursor,
  canCreate,
  onCreate,
  onPage,
}: {
  projectId: string;
  filters: Filters;
  cursor: ContractorBillFilters["cursor"];
  canCreate: boolean;
  onCreate: () => void;
  onPage: (cursor: ContractorBillFilters["cursor"]) => void;
}) {
  const { data } = useSuspenseQuery(
    contractorBillsQuery(projectId, { ...filters, cursor }),
  );
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const href = (bill: ContractorBillSummary) =>
    contractorBillsPath(projectId, bill.id);
  const number = (bill: ContractorBillSummary) => {
    const ra = raLabel(bill);
    return `${billNumber(bill.number)}${ra === "" ? "" : ` · ${ra}`}`;
  };

  if (data.items.length === 0)
    return (
      <div className="min-w-0 space-y-3">
        <RetentionHeld data={data} />
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileInput />
            </EmptyMedia>
            <EmptyTitle>
              {filtered ? "No bills match" : "No Contractor Bills yet"}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Try another status, Work Order or date."
                : "Draft a bill from an issued Work Order: it takes the checked measurements up to a date and works out what is due since the last bill."}
            </EmptyDescription>
          </EmptyHeader>
          {!filtered && canCreate && (
            <EmptyContent>
              <Button type="button" size="sm" onClick={onCreate}>
                New bill
              </Button>
            </EmptyContent>
          )}
        </Empty>
      </div>
    );

  return (
    <div className="min-w-0 space-y-3">
      <Totals data={data} />
      <RetentionHeld data={data} />
      <p className="text-muted-foreground text-sm">
        {plural(data.total, "bill")}
      </p>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table aria-label="Contractor Bills">
          <TableHeader>
            <TableRow>
              {CONTRACTOR_BILL_COLUMNS.map((column, index) => (
                <TableHead
                  key={index}
                  className={
                    index === 3 || index === 4 ? "text-right" : undefined
                  }
                >
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((bill) => (
              <TableRow key={bill.id}>
                <TableCell className="font-medium whitespace-nowrap">
                  <Link href={href(bill)} className="hover:underline">
                    {number(bill)}
                  </Link>
                </TableCell>
                <TableCell className="max-w-56">
                  <div className="truncate">{bill.contractorName}</div>
                  <div className="text-muted-foreground truncate text-xs">
                    {bill.workOrderNumber ?? "Work Order"}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {dateText(bill.billDate)}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  {moneyOrDash(bill.gross)}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  {moneyOrDash(bill.net)}
                </TableCell>
                <TableCell>
                  <BillStatusBadge status={bill.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul aria-label="Contractor Bills" className="space-y-2 md:hidden">
        {data.items.map((bill) => (
          <li key={bill.id} className="min-w-0 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={href(bill)}
                className="min-w-0 font-medium break-words hover:underline"
              >
                {number(bill)}
              </Link>
              <BillStatusBadge status={bill.status} />
            </div>
            <p className="mt-1 truncate text-sm">{bill.contractorName}</p>
            <p className="text-muted-foreground text-xs break-words">
              {dateText(bill.billDate)} · {bill.workOrderNumber ?? "Work Order"}
              {bill.net == null ? "" : ` · Net ${moneyOrDash(bill.net)}`}
            </p>
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
    </div>
  );
}
