"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  CircleCheck,
  CircleX,
  ClipboardCheck,
  Clock,
  LayoutGrid,
  Plus,
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
import { Input } from "@repo/ui/components/input";
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
import { localToday } from "@/components/payments/payment-format";
import {
  DateFilter,
  NO_DATE_FILTER,
  type DateFilterValue,
} from "@/components/procurement/purchase-requests/date-filter";
import { FilterSelect } from "@/components/procurement/purchase-requests/filter-select";
import { fieldForCode } from "@/lib/server-errors";
import { locationOptionsQuery } from "@/src/queries/location-options";
import {
  canInTracking,
  trackingAccessQuery,
} from "@/src/queries/tracking-access";
import {
  inspectionFormOptionsQuery,
  inspectionsPath,
  inspectionsQuery,
  useBulkDecideInspections,
  type Inspection,
  type InspectionBulkOutcome,
  type InspectionFilters,
} from "@/src/queries/tracking-inspections";
import { isLocationType } from "@/src/shared-kernel/location-ref";
import {
  INSPECTION_STATUS_LABELS,
  INSPECTION_STATUSES,
  isInspectionStatus,
  type InspectionStatus,
} from "@/src/tracking/domain/inspection";

import {
  InspectionRejectDialog,
  InspectionStatusBadge,
  inspectionWhen,
} from "./inspection-format";
import {
  InspectionFiltersSkeleton,
  InspectionRowsSkeleton,
} from "@/components/tracking/tracking-skeletons";

const MENU = "tracking.inspection_requests" as const;
const ALL = "all";

const STATUS_ICONS = {
  pending: Clock,
  approved: CircleCheck,
  rejected: CircleX,
} satisfies Record<InspectionStatus, typeof Clock>;

type Filters = {
  status: InspectionStatus | null;
  departmentId: string;
  contractorId: string;
  inspectorMemberId: string;
  /** `type:id`, or "". */
  location: string;
  date: DateFilterValue;
  search: string;
};

const NO_FILTERS: Filters = {
  status: null,
  departmentId: "",
  contractorId: "",
  inspectorMemberId: "",
  location: "",
  date: NO_DATE_FILTER,
  search: "",
};

function toQuery(filters: Filters): InspectionFilters {
  const [type = "", id = ""] = filters.location.split(":");
  return {
    status: filters.status,
    departmentId: filters.departmentId,
    contractorId: filters.contractorId,
    inspectorMemberId: filters.inspectorMemberId,
    location: isLocationType(type) && id !== "" ? { type: type, id } : null,
    from: filters.date.from,
    to: filters.date.to,
    search: filters.search,
  };
}

function outcomeText(
  outcome: InspectionBulkOutcome,
  verb: "approved" | "rejected",
): string {
  const parts = [
    `${String(outcome.decided)} ${outcome.decided === 1 ? "request" : "requests"} ${verb}`,
  ];
  if (outcome.skipped > 0)
    parts.push(`${String(outcome.skipped)} skipped (not pending)`);
  if (outcome.snags.length > 0)
    parts.push(
      `${String(outcome.snags.length)} ${outcome.snags.length === 1 ? "snag" : "snags"} raised`,
    );
  return `${parts.join(" · ")}.`;
}

/**
 * A Project's Inspection Requests (CM-804): status tabs with counts,
 * filters (Department, Contractor, Inspector, location, date, search),
 * and for approvers a bulk mode that approves or rejects (one reason, and
 * **Also raise a snag**) the selected pending requests, skipping the rest.
 */
export function InspectionsList({
  projectId,
  today = localToday(),
}: {
  projectId: string;
  /** `YYYY-MM-DD`; the device's today unless a story fixes it. */
  today?: string;
}) {
  const access = useQuery(trackingAccessQuery(projectId)).data;
  const may = (flag: Parameters<typeof canInTracking>[2]) =>
    access != null && canInTracking(access, MENU, flag);
  const canRaiseSnag =
    access != null && canInTracking(access, "tracking.issues", "create");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [cursor, setCursor] = useState<InspectionFilters["cursor"]>(null);
  const [bulk, setBulk] = useState(false);
  // Filter and page changes keep the old rows on screen, dimmed (ADR-0047).
  const [isPending, startTransition] = useTransition();
  const change = (next: Partial<Filters>) => {
    startTransition(() => {
      setFilters((current) => ({ ...current, ...next }));
      setCursor(null);
    });
  };
  const newHref = inspectionsPath(projectId, "/new");
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Inspection Requests</h2>
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
            <Link href={newHref} className={buttonVariants({ size: "sm" })}>
              <Plus aria-hidden="true" />
              Add Inspection Request
            </Link>
          )}
        </div>
      </div>
      <Suspense fallback={<InspectionFiltersSkeleton />}>
        <FilterBar
          projectId={projectId}
          today={today}
          filters={filters}
          onChange={change}
        />
      </Suspense>
      <Suspense fallback={<InspectionRowsSkeleton bulk={bulk} />}>
        <Rows
          className={cn(isPending && "opacity-60 transition-opacity")}
          projectId={projectId}
          filters={filters}
          cursor={cursor}
          bulk={bulk}
          canApprove={may("approve")}
          canReject={may("reject")}
          canRaiseSnag={canRaiseSnag}
          newHref={may("create") ? newHref : null}
          onStatus={(status) => {
            change({ status });
          }}
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

function FilterBar({
  projectId,
  today,
  filters,
  onChange,
}: {
  projectId: string;
  today: string;
  filters: Filters;
  onChange: (next: Partial<Filters>) => void;
}) {
  // The query follows in a transition; the box shows every keystroke at
  // once, or a slow list reload would drop characters.
  const [search, setSearch] = useState(filters.search);
  const { data: options } = useSuspenseQuery(
    inspectionFormOptionsQuery(projectId),
  );
  const { data: places } = useSuspenseQuery(locationOptionsQuery(projectId));
  const locations = [
    ...places.wings.map((row) => ({
      value: `wing:${row.id}`,
      label: row.name,
    })),
    ...places.amenities.map((row) => ({
      value: `amenity:${row.id}`,
      label: `Amenity · ${row.name}`,
    })),
    ...places.commonDevelopments.map((row) => ({
      value: `common_development:${row.id}`,
      label: `Common Development · ${row.name}`,
    })),
    ...places.locations.map((row) => ({
      value: `location:${row.id}`,
      label: row.name,
    })),
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
      <FilterSelect
        id="inspections-department"
        label="Department"
        value={filters.departmentId}
        options={options.departments.map((item) => ({
          value: item.id,
          label: item.name,
        }))}
        onChange={(departmentId) => {
          onChange({ departmentId });
        }}
      />
      <FilterSelect
        id="inspections-contractor"
        label="Contractor"
        value={filters.contractorId}
        options={options.contractors.map((item) => ({
          value: item.id,
          label: item.name,
        }))}
        onChange={(contractorId) => {
          onChange({ contractorId });
        }}
      />
      <FilterSelect
        id="inspections-inspector"
        label="Inspector"
        value={filters.inspectorMemberId}
        options={options.members.map((item) => ({
          value: item.id,
          label: item.name,
        }))}
        onChange={(inspectorMemberId) => {
          onChange({ inspectorMemberId });
        }}
      />
      {locations.length > 0 && (
        <FilterSelect
          id="inspections-location"
          label="Location"
          value={filters.location}
          options={locations}
          onChange={(location) => {
            onChange({ location });
          }}
        />
      )}
      <DateFilter
        idPrefix="inspections"
        value={filters.date}
        today={today}
        onChange={(date) => {
          onChange({ date });
        }}
      />
      <Input
        type="search"
        aria-label="Search by Request No or work"
        placeholder="Request No or work"
        className="col-span-2 h-8 w-full sm:w-56"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          onChange({ search: event.target.value });
        }}
      />
    </div>
  );
}

function Rows({
  projectId,
  filters,
  cursor,
  bulk,
  canApprove,
  canReject,
  canRaiseSnag,
  newHref,
  onStatus,
  onPage,
  className,
}: {
  projectId: string;
  filters: Filters;
  cursor: InspectionFilters["cursor"];
  bulk: boolean;
  canApprove: boolean;
  canReject: boolean;
  canRaiseSnag: boolean;
  newHref: string | null;
  onStatus: (status: InspectionStatus | null) => void;
  onPage: (cursor: InspectionFilters["cursor"]) => void;
  className?: string;
}) {
  const { data } = useSuspenseQuery(
    inspectionsQuery(projectId, { ...toQuery(filters), cursor }),
  );
  const decide = useBulkDecideInspections();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // A selection belongs to the rows on screen: another filter, page or
  // leaving bulk mode starts empty, so a hidden row never comes back chosen.
  const view = JSON.stringify([filters, cursor, bulk]);
  const [selectedIn, setSelectedIn] = useState(view);
  if (selectedIn !== view) {
    setSelectedIn(view);
    setSelected(new Set());
  }
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const allCount =
    data.counts.pending + data.counts.approved + data.counts.rejected;
  const selectable = (row: Inspection) => row.status === "pending";
  const chosen = data.items.filter(
    (row) => selected.has(row.id) && selectable(row),
  );
  const toggle = (id: string, on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const run = async (
    decision:
      | { approve: true }
      | { approve: false; reason: string; raiseSnag: boolean },
  ) => {
    setError(undefined);
    setNotice(undefined);
    try {
      const ids = chosen.map((row) => row.id);
      const outcome = await decide.mutateAsync(
        decision.approve
          ? { approve: true, projectId, ids }
          : { ...decision, projectId, ids },
      );
      setSelected(new Set());
      setNotice(
        outcomeText(outcome, decision.approve ? "approved" : "rejected"),
      );
    } catch (failure) {
      throw new Error(fieldForCode(failure, {}).message, { cause: failure });
    }
  };

  const tabs = (
    <FilterTabs
      aria-label="Status"
      items={[
        { value: ALL, label: "All", icon: LayoutGrid, count: allCount },
        ...INSPECTION_STATUSES.map((status) => ({
          value: status,
          label: INSPECTION_STATUS_LABELS[status],
          icon: STATUS_ICONS[status],
          count: data.counts[status],
        })),
      ]}
      value={filters.status ?? ALL}
      onValueChange={(next) => {
        onStatus(isInspectionStatus(next) ? next : null);
      }}
    />
  );

  if (data.items.length === 0)
    return (
      <div className="space-y-4">
        {(filtered || allCount > 0) && tabs}
        <Empty className="bg-card border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardCheck />
            </EmptyMedia>
            <EmptyTitle>
              {filtered
                ? "No Inspection Requests match"
                : "No Inspection Requests yet"}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Try another status, contractor, inspector or date."
                : "Ask an inspector to check work at a location before it is covered up: slab reinforcement, shuttering, waterproofing."}
            </EmptyDescription>
          </EmptyHeader>
          {!filtered && newHref != null && (
            <EmptyContent>
              <Link href={newHref} className={buttonVariants({ size: "sm" })}>
                Add Inspection Request
              </Link>
            </EmptyContent>
          )}
        </Empty>
      </div>
    );

  const check = (row: Inspection) =>
    bulk ? (
      <Checkbox
        aria-label={`Select ${row.number}`}
        disabled={!selectable(row)}
        checked={selected.has(row.id)}
        onCheckedChange={(on) => {
          toggle(row.id, on);
        }}
      />
    ) : null;
  const href = (row: Inspection) => inspectionsPath(projectId, `/${row.id}`);

  return (
    <div className={cn("min-w-0 space-y-3", className)}>
      {tabs}
      <p className="text-muted-foreground text-sm">
        {data.total} {data.total === 1 ? "request" : "requests"}
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
            {chosen.length} selected · only pending requests can be decided
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
                  run({ approve: true }).catch((failure: unknown) => {
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
      <div className="bg-card hidden overflow-x-auto rounded-lg border md:block">
        <Table aria-label="Inspection Requests">
          <TableHeader>
            <TableRow>
              {bulk && (
                <TableHead className="w-10">
                  <span className="sr-only">Select</span>
                </TableHead>
              )}
              <TableHead>Request No</TableHead>
              <TableHead>Inspection</TableHead>
              <TableHead>Work</TableHead>
              <TableHead>Contractor</TableHead>
              <TableHead>Inspector</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((row) => (
              <TableRow key={row.id}>
                {bulk && <TableCell>{check(row)}</TableCell>}
                <TableCell className="font-medium whitespace-nowrap">
                  <Link href={href(row)} className="hover:underline">
                    {row.number}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {inspectionWhen(row)}
                </TableCell>
                <TableCell className="max-w-64">
                  <div className="truncate">{row.workDescription}</div>
                  {row.department?.name != null && (
                    <div className="text-muted-foreground truncate text-xs">
                      {row.department.name}
                    </div>
                  )}
                </TableCell>
                <TableCell className="max-w-48 truncate">
                  {row.contractor?.name ?? "—"}
                </TableCell>
                <TableCell className="max-w-40 truncate">
                  {row.inspector?.name ?? "—"}
                </TableCell>
                <TableCell>
                  <InspectionStatusBadge status={row.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul aria-label="Inspection Requests" className="space-y-2 md:hidden">
        {data.items.map((row) => (
          <li key={row.id} className="bg-card rounded-lg border p-3">
            <div className="flex items-start gap-3">
              {check(row)}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={href(row)}
                    className="font-medium hover:underline"
                  >
                    {row.number}
                  </Link>
                  <InspectionStatusBadge status={row.status} />
                </div>
                <p className="truncate text-sm">{row.workDescription}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {inspectionWhen(row)} ·{" "}
                  {row.contractor?.name ?? "No contractor"}
                  {row.inspector?.name != null && ` · ${row.inspector.name}`}
                </p>
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
      <InspectionRejectDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title={`Reject ${String(chosen.length)} ${chosen.length === 1 ? "request" : "requests"}?`}
        description="Each selected pending request is rejected with this reason. Requests already decided are skipped."
        canRaiseSnag={canRaiseSnag}
        onSubmit={({ reason, raiseSnag }) =>
          run({ approve: false, reason, raiseSnag })
        }
      />
    </div>
  );
}
