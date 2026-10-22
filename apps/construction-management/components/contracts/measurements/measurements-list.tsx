"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Plus, Ruler } from "lucide-react";
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
  MEASUREMENT_STATUSES,
  SIDE_LABELS,
  SIDES,
  type MeasurementStatus,
  type Side,
} from "@/src/contracts/domain/contract-terms";
import {
  measurementFormOptionsQuery,
  measurementsPath,
  measurementsQuery,
  type MeasurementFilters,
  type MeasurementSummary,
} from "@/src/queries/contracts-measurements";

import {
  dateText,
  MeasurementStatusBadge,
  sideText,
} from "./measurement-format";
import {
  MEASUREMENT_COLUMNS,
  MeasurementRowsSkeleton,
} from "./measurements-skeletons";

type Filters = Omit<MeasurementFilters, "cursor">;

const NO_FILTERS: Filters = { side: "", workOrderId: "", status: "" };

const STATUS_WORDS: Record<MeasurementStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  checked: "Checked",
};

function plural(n: number, word: string): string {
  return `${String(n)} ${n === 1 ? word : `${word}s`}`;
}

/** Who measured with us: "R. Kumar (Client's engineer) · 21 Oct 2026". */
function jointText(sheet: MeasurementSummary): string {
  if (sheet.partyName == null) return "—";
  const role = sheet.partyRole == null ? "" : ` (${sheet.partyRole})`;
  return `${sheet.partyName}${role} · ${dateText(sheet.jointOn)}`;
}

/**
 * Project → Contracts → **Measurements** (CM-1105): the Measurement Book's
 * sheets, latest measured first, by side, Work Order and status; cards at
 * phone width, a table above. Create holders start a sheet on either side.
 */
export function MeasurementsList({
  projectId,
  canCreate,
}: {
  projectId: string;
  canCreate: boolean;
}) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [cursor, setCursor] = useState<MeasurementFilters["cursor"]>(null);
  const [updating, startTransition] = useTransition();
  const change = (next: Partial<Filters>) => {
    startTransition(() => {
      setFilters((current) => ({ ...current, ...next }));
      setCursor(null);
    });
  };
  // Issued Work Orders for the filter; only editors may read the form's options.
  const workOrders =
    useQuery({ ...measurementFormOptionsQuery(projectId), enabled: canCreate })
      .data?.workOrders ?? [];
  const newHref = (side: Side) =>
    `${measurementsPath(projectId)}/new?side=${side}`;
  return (
    <div className="flex w-full max-w-6xl min-w-0 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold">Measurements</h2>
          <p className="text-muted-foreground text-sm">
            The Measurement Book: work measured on site, checked jointly with
            the Client or the Contractor, and billed from there.
          </p>
        </div>
        {canCreate && (
          <div className="flex flex-wrap gap-2">
            <Link
              href={newHref("client")}
              className={buttonVariants({ size: "sm" })}
            >
              <Plus aria-hidden="true" />
              Client sheet
            </Link>
            <Link
              href={newHref("contractor")}
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              <Plus aria-hidden="true" />
              Contractor sheet
            </Link>
          </div>
        )}
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <FilterSelect
          id="measurements-side"
          label="Side"
          allLabel="Both sides"
          value={filters.side}
          options={SIDES.map((side) => ({
            value: side,
            label: SIDE_LABELS[side],
          }))}
          onChange={(side) => {
            change({
              side: side as Side | "",
              workOrderId: side === "client" ? "" : filters.workOrderId,
            });
          }}
        />
        <FilterSelect
          id="measurements-status"
          label="Status"
          allLabel="Every status"
          value={filters.status}
          options={MEASUREMENT_STATUSES.map((status) => ({
            value: status,
            label: STATUS_WORDS[status],
          }))}
          onChange={(status) => {
            change({ status: status as MeasurementStatus | "" });
          }}
        />
        {workOrders.length > 0 && filters.side !== "client" && (
          <div className="col-span-2 sm:col-span-1">
            <FilterSelect
              id="measurements-work-order"
              label="Work Order"
              allLabel="Every Work Order"
              value={filters.workOrderId}
              options={workOrders.map((order) => ({
                value: order.id,
                label: `${order.number} · ${order.contractorName}`,
              }))}
              onChange={(workOrderId) => {
                change({
                  workOrderId,
                  side: workOrderId === "" ? filters.side : "contractor",
                });
              }}
            />
          </div>
        )}
      </div>
      <div
        className={cn("min-w-0", updating && "opacity-60 transition-opacity")}
      >
        <Suspense fallback={<MeasurementRowsSkeleton />}>
          <MeasurementRows
            projectId={projectId}
            filters={filters}
            cursor={cursor}
            newHref={canCreate ? newHref("client") : null}
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

function MeasurementRows({
  projectId,
  filters,
  cursor,
  newHref,
  onPage,
}: {
  projectId: string;
  filters: Filters;
  cursor: MeasurementFilters["cursor"];
  newHref: string | null;
  onPage: (cursor: MeasurementFilters["cursor"]) => void;
}) {
  const { data } = useSuspenseQuery(
    measurementsQuery(projectId, { ...filters, cursor }),
  );
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const href = (sheet: MeasurementSummary) =>
    measurementsPath(projectId, sheet.id);

  if (data.items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Ruler />
          </EmptyMedia>
          <EmptyTitle>
            {filtered ? "No sheets match" : "No measurement sheets yet"}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try another side, Work Order or status."
              : "Record what was measured on site: nos × length × breadth × depth against a BOQ item or a Work Order line. Submit it for the joint measurement with the other party."}
          </EmptyDescription>
        </EmptyHeader>
        {!filtered && newHref != null && (
          <EmptyContent>
            <Link href={newHref} className={buttonVariants({ size: "sm" })}>
              New sheet
            </Link>
          </EmptyContent>
        )}
      </Empty>
    );

  return (
    <div className="min-w-0 space-y-3">
      <p className="text-muted-foreground text-sm">
        {plural(data.total, "sheet")}
      </p>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table aria-label="Measurement sheets">
          <TableHeader>
            <TableRow>
              {MEASUREMENT_COLUMNS.map((column, index) => (
                <TableHead
                  key={index}
                  className={index === 3 ? "text-right" : undefined}
                >
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((sheet) => (
              <TableRow key={sheet.id}>
                <TableCell className="font-medium whitespace-nowrap">
                  <Link href={href(sheet)} className="hover:underline">
                    {dateText(sheet.measuredOn)}
                  </Link>
                </TableCell>
                <TableCell className="max-w-56">
                  <div className="truncate">
                    {sideText(sheet.side, sheet.workOrderNumber)}
                  </div>
                  {sheet.partyLabel == null ? null : (
                    <div className="text-muted-foreground truncate text-xs">
                      {sheet.partyLabel}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-64">
                  <div className="truncate">{sheet.title ?? "—"}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {sheet.rowCount}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-56">
                  <div className="truncate">{jointText(sheet)}</div>
                </TableCell>
                <TableCell>
                  <MeasurementStatusBadge
                    status={sheet.status}
                    billed={sheet.billed}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul aria-label="Measurement sheets" className="space-y-2 md:hidden">
        {data.items.map((sheet) => (
          <li key={sheet.id} className="min-w-0 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={href(sheet)}
                className="min-w-0 font-medium break-words hover:underline"
              >
                {dateText(sheet.measuredOn)}
              </Link>
              <MeasurementStatusBadge
                status={sheet.status}
                billed={sheet.billed}
              />
            </div>
            <p className="mt-1 truncate text-sm">
              {sideText(sheet.side, sheet.workOrderNumber)}
            </p>
            <p className="text-muted-foreground truncate text-xs">
              {[sheet.partyLabel, sheet.title, plural(sheet.rowCount, "row")]
                .filter((part) => part != null)
                .join(" · ")}
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
            Later
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={data.nextCursor == null}
            onClick={() => {
              if (data.nextCursor != null) onPage({ after: data.nextCursor });
            }}
          >
            Earlier
          </Button>
        </div>
      )}
    </div>
  );
}
