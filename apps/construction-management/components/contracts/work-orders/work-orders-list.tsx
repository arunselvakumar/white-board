"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense, useState, useTransition } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
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
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_STATUSES,
  type WorkOrderStatus,
} from "@/src/contracts/domain/contract-terms";
import {
  workOrderFormOptionsQuery,
  workOrdersPath,
  workOrdersQuery,
  type WorkOrderFilters,
  type WorkOrderSummary,
} from "@/src/queries/contracts-work-orders";

import {
  dateText,
  moneyOrDash,
  WorkOrderStatusBadge,
  workOrderNumber,
} from "./work-order-format";
import {
  WORK_ORDER_COLUMNS,
  WorkOrderRowsSkeleton,
} from "./work-orders-skeletons";

type Filters = Omit<WorkOrderFilters, "cursor">;

const NO_FILTERS: Filters = { status: "", contractorId: "", search: "" };

function plural(n: number, word: string): string {
  return `${String(n)} ${n === 1 ? word : `${word}s`}`;
}

/**
 * Project → Contracts → **Work Orders** (CM-1104): newest first, by status,
 * Contractor or a search on the number or scope; cards at phone width, a
 * table above. Work Order Create holders add one.
 */
export function WorkOrdersList({
  projectId,
  canCreate,
}: {
  projectId: string;
  canCreate: boolean;
}) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<WorkOrderFilters["cursor"]>(null);
  const [updating, startTransition] = useTransition();
  const change = (next: Partial<Filters>) => {
    startTransition(() => {
      setFilters((current) => ({ ...current, ...next }));
      setCursor(null);
    });
  };
  // Contractors on the Project for the filter; only editors may read the form's options.
  const contractors =
    useQuery({ ...workOrderFormOptionsQuery(projectId), enabled: canCreate })
      .data?.contractors ?? [];
  const newHref = `${workOrdersPath(projectId)}/new`;
  return (
    <div className="flex w-full max-w-6xl min-w-0 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold">Work Orders</h2>
          <p className="text-muted-foreground text-sm">
            What each Contractor is given to do, at what rate and on what terms.
          </p>
        </div>
        {canCreate && (
          <Link href={newHref} className={buttonVariants({ size: "sm" })}>
            <Plus aria-hidden="true" />
            New Work Order
          </Link>
        )}
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <FilterSelect
          id="work-orders-status"
          label="Status"
          allLabel="Every status"
          value={filters.status}
          options={WORK_ORDER_STATUSES.map((status) => ({
            value: status,
            label: WORK_ORDER_STATUS_LABELS[status],
          }))}
          onChange={(status) => {
            change({ status: status as WorkOrderStatus | "" });
          }}
        />
        {contractors.length > 1 && (
          <FilterSelect
            id="work-orders-contractor"
            label="Contractor"
            allLabel="Every Contractor"
            value={filters.contractorId}
            options={contractors.map((contractor) => ({
              value: contractor.id,
              label: contractor.name,
            }))}
            onChange={(contractorId) => {
              change({ contractorId });
            }}
          />
        )}
        <div className="col-span-2 min-w-0 space-y-1 sm:col-span-1">
          <Label htmlFor="work-orders-search" className="text-xs">
            Search
          </Label>
          <Input
            id="work-orders-search"
            type="search"
            placeholder="Number or scope"
            className="h-8 w-full sm:w-64"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              change({ search: event.target.value });
            }}
          />
        </div>
      </div>
      <div
        className={cn("min-w-0", updating && "opacity-60 transition-opacity")}
      >
        <Suspense fallback={<WorkOrderRowsSkeleton />}>
          <WorkOrderRows
            projectId={projectId}
            filters={filters}
            cursor={cursor}
            newHref={canCreate ? newHref : null}
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

function WorkOrderRows({
  projectId,
  filters,
  cursor,
  newHref,
  onPage,
}: {
  projectId: string;
  filters: Filters;
  cursor: WorkOrderFilters["cursor"];
  newHref: string | null;
  onPage: (cursor: WorkOrderFilters["cursor"]) => void;
}) {
  const { data } = useSuspenseQuery(
    workOrdersQuery(projectId, { ...filters, cursor }),
  );
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const href = (workOrder: WorkOrderSummary) =>
    workOrdersPath(projectId, workOrder.id);
  const number = (workOrder: WorkOrderSummary) =>
    `${workOrderNumber(workOrder.number)}${workOrder.revision > 0 ? ` · Rev ${String(workOrder.revision)}` : ""}`;

  if (data.items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ClipboardList />
          </EmptyMedia>
          <EmptyTitle>
            {filtered ? "No Work Orders match" : "No Work Orders yet"}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try another status, Contractor or search."
              : "Give a Contractor on this Project its BOQ items at the work-order rate, with retention, DLP and GST terms. It is numbered when you submit it for approval."}
          </EmptyDescription>
        </EmptyHeader>
        {!filtered && newHref != null && (
          <EmptyContent>
            <Link href={newHref} className={buttonVariants({ size: "sm" })}>
              New Work Order
            </Link>
          </EmptyContent>
        )}
      </Empty>
    );

  return (
    <div className="min-w-0 space-y-3">
      <p className="text-muted-foreground text-sm">
        {plural(data.total, "Work Order")}
      </p>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table aria-label="Work Orders">
          <TableHeader>
            <TableRow>
              {WORK_ORDER_COLUMNS.map((column, index) => (
                <TableHead
                  key={index}
                  className={index === 4 ? "text-right" : undefined}
                >
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((workOrder) => (
              <TableRow key={workOrder.id}>
                <TableCell className="font-medium whitespace-nowrap">
                  <Link href={href(workOrder)} className="hover:underline">
                    {number(workOrder)}
                  </Link>
                </TableCell>
                <TableCell className="max-w-56">
                  <div className="truncate">{workOrder.contractorName}</div>
                  {workOrder.departmentName == null ? null : (
                    <div className="text-muted-foreground truncate text-xs">
                      {workOrder.departmentName}
                    </div>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {dateText(workOrder.orderDate)}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-64">
                  <div className="truncate">{workOrder.scope ?? "—"}</div>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  {moneyOrDash(workOrder.value)}
                </TableCell>
                <TableCell>
                  <WorkOrderStatusBadge status={workOrder.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul aria-label="Work Orders" className="space-y-2 md:hidden">
        {data.items.map((workOrder) => (
          <li key={workOrder.id} className="min-w-0 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={href(workOrder)}
                className="min-w-0 font-medium break-words hover:underline"
              >
                {number(workOrder)}
              </Link>
              <WorkOrderStatusBadge status={workOrder.status} />
            </div>
            <p className="mt-1 truncate text-sm">{workOrder.contractorName}</p>
            <p className="text-muted-foreground text-xs">
              {dateText(workOrder.orderDate)}
              {workOrder.value == null
                ? ""
                : ` · ${moneyOrDash(workOrder.value)}`}
              {` · ${plural(workOrder.lineCount, "line")}`}
            </p>
            {workOrder.scope == null ? null : (
              <p className="text-muted-foreground mt-1 truncate text-xs">
                {workOrder.scope}
              </p>
            )}
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
