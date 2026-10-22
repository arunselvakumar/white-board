"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { FileOutput, Plus } from "lucide-react";
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
import { SkeletonGroup, SkeletonText } from "@repo/ui/components/skeleton-kit";
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
  clientBillsPath,
  clientBillsQuery,
  type ClientBillFilters,
  type ClientBillPage,
  type ClientBillSummary,
} from "@/src/queries/contracts-client-bills";

import {
  BillStatusBadge,
  billNumber,
  dateText,
  moneyOrDash,
  raLabel,
} from "./client-bill-format";
import { ClientBillSetupEmpty } from "./client-bill-setup";
import {
  CLIENT_BILL_COLUMNS,
  ClientBillRowsSkeleton,
} from "./client-bills-skeletons";
import { ClientContractTerms } from "./client-contract-terms";
import { NewClientBillDialog } from "./new-client-bill-dialog";

type Filters = Omit<ClientBillFilters, "cursor">;

const NO_FILTERS: Filters = { status: "", from: "", to: "" };

function plural(n: number, word: string): string {
  return `${String(n)} ${n === 1 ? word : `${word}s`}`;
}

/**
 * Project → Contracts → **Client Bills** (CM-1107, ADR CM-0023 §7): the
 * Project's outward RA bills to its Client, newest first, by status or
 * bill date, with the totals of what is shown and the retention
 * receivable; cards at phone width, a table above. When the Project cannot
 * be billed (Own development, no Client, no state) it says so with a link
 * to fix it. The client contract terms sit below.
 */
export function ClientBillsList({
  projectId,
  canCreate,
}: {
  projectId: string;
  canCreate: boolean;
}) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [cursor, setCursor] = useState<ClientBillFilters["cursor"]>(null);
  const [creating, setCreating] = useState(false);
  const [updating, startTransition] = useTransition();
  const change = (next: Partial<Filters>) => {
    startTransition(() => {
      setFilters((current) => ({ ...current, ...next }));
      setCursor(null);
    });
  };
  return (
    <div className="flex w-full max-w-6xl min-w-0 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold">Client Bills</h2>
          <p className="text-muted-foreground text-sm">
            Running account bills to the Project&apos;s Client, measured against
            the BOQ. Each is a tax invoice.
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
          id="client-bills-status"
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
        <div className="min-w-0 space-y-1">
          <Label htmlFor="client-bills-from" className="text-xs">
            From
          </Label>
          <Input
            id="client-bills-from"
            type="date"
            className="h-8 w-full sm:w-40"
            value={filters.from}
            onChange={(event) => {
              change({ from: event.target.value });
            }}
          />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor="client-bills-to" className="text-xs">
            To
          </Label>
          <Input
            id="client-bills-to"
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
        <Suspense fallback={<ClientBillRowsSkeleton />}>
          <ClientBillRows
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
      <Suspense
        fallback={
          <SkeletonGroup
            label="Loading the client contract terms"
            className="space-y-3 rounded-xl border p-4"
          >
            <SkeletonText size="base" width="12rem" />
            <SkeletonText width="80%" />
            <SkeletonText width="60%" />
          </SkeletonGroup>
        }
      >
        <ClientContractTerms projectId={projectId} />
      </Suspense>
      {canCreate ? (
        <NewClientBillDialog
          projectId={projectId}
          open={creating}
          onOpenChange={setCreating}
        />
      ) : null}
    </div>
  );
}

function Totals({ data }: { data: ClientBillPage }) {
  if (!data.financial || data.totals.count === 0) return null;
  const figures: [string, number | null][] = [
    ["Taxable value", data.totals.gross],
    ["GST", data.totals.gst],
    ["Deductions", data.totals.deductions],
    ["Net receivable", data.totals.net],
    ["Retention receivable", data.retentionReceivable],
  ];
  return (
    <section
      aria-label="Totals"
      className="grid min-w-0 grid-cols-2 gap-3 rounded-xl border p-3 sm:grid-cols-5"
    >
      {figures.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <p className="text-muted-foreground text-xs">{label}</p>
          <p className="text-sm font-semibold break-words tabular-nums">
            {moneyOrDash(value)}
          </p>
        </div>
      ))}
      <p className="text-muted-foreground col-span-2 text-xs sm:col-span-5">
        Over {plural(data.totals.count, "bill")} shown that count: drafts,
        pending and approved, not rejected or reversed. Retention receivable is
        what the Client holds on approved bills until it is released.
      </p>
    </section>
  );
}

function ClientBillRows({
  projectId,
  filters,
  cursor,
  canCreate,
  onCreate,
  onPage,
}: {
  projectId: string;
  filters: Filters;
  cursor: ClientBillFilters["cursor"];
  canCreate: boolean;
  onCreate: () => void;
  onPage: (cursor: ClientBillFilters["cursor"]) => void;
}) {
  const { data } = useSuspenseQuery(
    clientBillsQuery(projectId, { ...filters, cursor }),
  );
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const href = (bill: ClientBillSummary) => clientBillsPath(projectId, bill.id);
  const number = (bill: ClientBillSummary) => {
    const ra = raLabel(bill);
    return `${billNumber(bill.number)}${ra === "" ? "" : ` · ${ra}`}`;
  };

  if (data.items.length === 0) {
    if (!filtered && data.setup.blockers.length > 0)
      return <ClientBillSetupEmpty projectId={projectId} setup={data.setup} />;
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileOutput />
          </EmptyMedia>
          <EmptyTitle>
            {filtered ? "No bills match" : "No Client Bills yet"}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try another status or date."
              : `Draft a bill to ${data.setup.clientName ?? "the Client"}: it takes the checked client-side measurements up to a date and bills what is due since the last bill, with GST.`}
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
    );
  }

  return (
    <div className="min-w-0 space-y-3">
      {data.setup.blockers.length > 0 ? (
        <ClientBillSetupEmpty projectId={projectId} setup={data.setup} />
      ) : null}
      <Totals data={data} />
      <p className="text-muted-foreground text-sm">
        {plural(data.total, "bill")}
        {data.setup.clientName == null ? "" : ` to ${data.setup.clientName}`}
      </p>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table aria-label="Client Bills">
          <TableHeader>
            <TableRow>
              {CLIENT_BILL_COLUMNS.map((column, index) => (
                <TableHead
                  key={index}
                  className={
                    index >= 2 && index <= 4 ? "text-right" : undefined
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
                <TableCell className="whitespace-nowrap">
                  {dateText(bill.billDate)}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  {moneyOrDash(bill.gross)}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  {moneyOrDash(bill.gst)}
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
      <ul aria-label="Client Bills" className="space-y-2 md:hidden">
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
            <p className="text-muted-foreground mt-1 text-xs break-words">
              {dateText(bill.billDate)}
              {bill.net == null
                ? ""
                : ` · Net receivable ${moneyOrDash(bill.net)}`}
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
