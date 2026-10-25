"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  AlarmClock,
  BadgeCheck,
  CircleCheck,
  Clock,
  LayoutGrid,
  ListChecks,
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
import { FilterTabs, type FilterTab } from "@repo/ui/components/filter-tabs";
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

import { FormAlert } from "@/components/auth/form-alert";
import { formatDate, localToday } from "@/components/payments/payment-format";
import {
  DateFilter,
  NO_DATE_FILTER,
  type DateFilterValue,
} from "@/components/procurement/purchase-requests/date-filter";
import { FilterSelect } from "@/components/procurement/purchase-requests/filter-select";
import { QueryHttpError } from "@/src/queries/http";
import { locationOptionsQuery } from "@/src/queries/location-options";
import {
  canInTracking,
  trackingAccessQuery,
} from "@/src/queries/tracking-access";
import {
  issueFormOptionsQuery,
  issuesPath,
  issuesQuery,
  useBulkIssueTransition,
  type Issue,
  type IssueFilters,
} from "@/src/queries/tracking-issues";
import type { LocationType } from "@/src/shared-kernel/location-ref";
import {
  ISSUE_STATUS_LABELS,
  type IssueStatus,
} from "@/src/tracking/domain/issue";
import {
  TRACKING_PRIORITIES,
  type TrackingPriority,
} from "@/src/tracking/domain/tracking-documents";

import { IssueStatusBadge, PriorityChip } from "./issue-parts";
import {
  IssueFiltersSkeleton,
  IssueRowsSkeleton,
} from "@/components/tracking/tracking-skeletons";

type Filters = {
  statuses: IssueStatus[];
  priority: string;
  categoryId: string;
  assigneeMemberId: string;
  departmentId: string;
  contractorId: string;
  /** `type:id` of a Wing, Amenity, Common Development or Location. */
  place: string;
  date: DateFilterValue;
  search: string;
};

const NO_FILTERS: Filters = {
  statuses: [],
  priority: "",
  categoryId: "",
  assigneeMemberId: "",
  departmentId: "",
  contractorId: "",
  place: "",
  date: NO_DATE_FILTER,
  search: "",
};

function toQuery(filters: Filters): IssueFilters {
  const [type, placeId] = filters.place.split(":");
  return {
    statuses: filters.statuses,
    priorities:
      filters.priority === "" ? [] : [filters.priority as TrackingPriority],
    categoryId: filters.categoryId,
    assigneeMemberId: filters.assigneeMemberId,
    departmentId: filters.departmentId,
    contractorId: filters.contractorId,
    locationType: filters.place === "" ? undefined : (type as LocationType),
    placeId,
    from: filters.date.from,
    to: filters.date.to,
    search: filters.search,
  };
}

const STATUS_TABS: FilterTab<IssueStatus | "all">[] = [
  { value: "all", label: "All", icon: LayoutGrid },
  { value: "pending", label: ISSUE_STATUS_LABELS.pending, icon: Clock },
  { value: "delayed", label: ISSUE_STATUS_LABELS.delayed, icon: AlarmClock },
  { value: "solved", label: ISSUE_STATUS_LABELS.solved, icon: CircleCheck },
  { value: "closed", label: ISSUE_STATUS_LABELS.closed, icon: BadgeCheck },
];

function plural(n: number, word: string): string {
  return `${String(n)} ${n === 1 ? word : `${word}s`}`;
}

/**
 * A Project's Issues & Snags (CM-803): status tabs All / Pending /
 * Delayed / Solved / Closed (Delayed is open past the Due Date), filters by
 * priority, category, assignee, Department, Contractor, location, Issue
 * Date and a search; select issues to **Mark As Solved** (Update) or
 * **Verify** (Approve) them together, the rest skipped and counted.
 * Without View all the server lists only the viewer's own and assigned
 * issues.
 */
export function IssuesList({
  projectId,
  today = localToday(),
}: {
  projectId: string;
  /** `YYYY-MM-DD`; the device's today unless a story fixes it. */
  today?: string;
}) {
  const access = useQuery(trackingAccessQuery(projectId)).data;
  const may = (flag: Parameters<typeof canInTracking>[2]) =>
    access != null && canInTracking(access, "tracking.issues", flag);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [cursor, setCursor] = useState<IssueFilters["cursor"]>(null);
  // Filter and page changes keep the old rows on screen, dimmed (ADR-0047).
  const [isPending, startTransition] = useTransition();
  const change = (next: Partial<Filters>) => {
    startTransition(() => {
      setFilters((current) => ({ ...current, ...next }));
      setCursor(null);
    });
  };
  const newHref = `${issuesPath(projectId)}/new`;
  return (
    <div className="flex w-full max-w-6xl min-w-0 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Issues &amp; Snags</h2>
        {may("create") && (
          <Link href={newHref} className={buttonVariants({ size: "sm" })}>
            <Plus aria-hidden="true" />
            Add Issue
          </Link>
        )}
      </div>
      <FilterTabs
        aria-label="Status"
        items={STATUS_TABS}
        value={filters.statuses[0] ?? "all"}
        onValueChange={(next) => {
          change({ statuses: next === "all" ? [] : [next] });
        }}
      />
      <Suspense fallback={<IssueFiltersSkeleton />}>
        <FilterBar
          projectId={projectId}
          filters={filters}
          today={today}
          onChange={change}
        />
      </Suspense>
      <Suspense
        fallback={
          <IssueRowsSkeleton selecting={may("update") || may("approve")} />
        }
      >
        <IssueRows
          projectId={projectId}
          filters={filters}
          cursor={cursor}
          canSolve={may("update")}
          canVerify={may("approve")}
          newHref={may("create") ? newHref : null}
          onPage={(next) => {
            startTransition(() => {
              setCursor(next);
            });
          }}
          className={cn(isPending && "opacity-60 transition-opacity")}
        />
      </Suspense>
    </div>
  );
}

function FilterBar({
  projectId,
  filters,
  today,
  onChange,
}: {
  projectId: string;
  filters: Filters;
  today: string;
  onChange: (next: Partial<Filters>) => void;
}) {
  // The query follows in a transition; the box shows every keystroke at
  // once, or a slow list reload would drop characters.
  const [search, setSearch] = useState(filters.search);
  const { data: options } = useSuspenseQuery(issueFormOptionsQuery(projectId));
  const places = useQuery(locationOptionsQuery(projectId)).data;
  const placeOptions =
    places == null
      ? []
      : [
          ...places.wings.map((wing) => ({
            value: `wing:${wing.id}`,
            label: wing.name,
          })),
          ...places.amenities.map((item) => ({
            value: `amenity:${item.id}`,
            label: item.name,
          })),
          ...places.commonDevelopments.map((item) => ({
            value: `common_development:${item.id}`,
            label: item.name,
          })),
          ...places.locations.map((item) => ({
            value: `location:${item.id}`,
            label: item.name,
          })),
        ];
  return (
    <div className="grid min-w-0 grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
      <FilterSelect
        id="issues-priority"
        label="Priority"
        allLabel="Any priority"
        value={filters.priority}
        options={TRACKING_PRIORITIES.map((item) => ({
          value: item.key,
          label: item.label,
        }))}
        onChange={(priority) => {
          onChange({ priority });
        }}
      />
      <FilterSelect
        id="issues-category"
        label="Category"
        allLabel="Any category"
        value={filters.categoryId}
        options={options.issueCategories.map((item) => ({
          value: item.id,
          label: item.name,
        }))}
        onChange={(categoryId) => {
          onChange({ categoryId });
        }}
      />
      <FilterSelect
        id="issues-assignee"
        label="Assigned to"
        allLabel="Anyone"
        value={filters.assigneeMemberId}
        options={options.members.map((item) => ({
          value: item.id,
          label: item.name,
        }))}
        onChange={(assigneeMemberId) => {
          onChange({ assigneeMemberId });
        }}
      />
      <FilterSelect
        id="issues-department"
        label="Department"
        allLabel="Any department"
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
        id="issues-contractor"
        label="Contractor"
        allLabel="Any Contractor"
        value={filters.contractorId}
        options={options.contractors.map((item) => ({
          value: item.id,
          label: item.name,
        }))}
        onChange={(contractorId) => {
          onChange({ contractorId });
        }}
      />
      {placeOptions.length > 0 && (
        <FilterSelect
          id="issues-location"
          label="Location"
          allLabel="Anywhere"
          value={filters.place}
          options={placeOptions}
          onChange={(place) => {
            onChange({ place });
          }}
        />
      )}
      <DateFilter
        idPrefix="issues"
        value={filters.date}
        today={today}
        onChange={(date) => {
          onChange({ date });
        }}
      />
      <div className="col-span-2 min-w-0 space-y-1 sm:col-span-1">
        <Label htmlFor="issues-search" className="text-xs">
          Search
        </Label>
        <Input
          id="issues-search"
          type="search"
          placeholder="Number or details"
          className="w-full sm:w-52"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            onChange({ search: event.target.value });
          }}
        />
      </div>
    </div>
  );
}

function IssueRows({
  projectId,
  filters,
  cursor,
  canSolve,
  canVerify,
  newHref,
  onPage,
  className,
}: {
  projectId: string;
  filters: Filters;
  cursor: IssueFilters["cursor"];
  canSolve: boolean;
  canVerify: boolean;
  newHref: string | null;
  onPage: (cursor: IssueFilters["cursor"]) => void;
  className?: string;
}) {
  const { data } = useSuspenseQuery(
    issuesQuery(projectId, { ...toQuery(filters), cursor }),
  );
  const bulk = useBulkIssueTransition();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // A selection belongs to the rows on screen: another filter or page
  // starts empty, so a hidden row never comes back chosen.
  const view = JSON.stringify([filters, cursor]);
  const [selectedIn, setSelectedIn] = useState(view);
  if (selectedIn !== view) {
    setSelectedIn(view);
    setSelected(new Set());
  }
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const selecting = canSolve || canVerify;
  const chosen = data.items.filter((issue) => selected.has(issue.id));
  const solvable = chosen.filter((issue) => issue.storedStatus === "open");
  const verifiable = chosen.filter((issue) => issue.storedStatus === "solved");
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  const toggle = (id: string, on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const run = (action: "solve" | "verify") => {
    setError(undefined);
    setNotice(undefined);
    bulk.mutate(
      { action, projectId, ids: chosen.map((issue) => issue.id) },
      {
        onSuccess: (result) => {
          setSelected(new Set());
          const done = `${plural(result.done, "issue")} ${action === "solve" ? "marked as solved" : "verified"}.`;
          const skipped =
            result.skipped === 0
              ? ""
              : ` ${String(result.skipped)} skipped: ${action === "solve" ? "already solved or closed" : "not solved"}.`;
          setNotice(done + skipped);
        },
        onError: (failure) => {
          setError(
            failure instanceof QueryHttpError
              ? failure.message
              : "Something went wrong. Please try again.",
          );
        },
      },
    );
  };

  if (data.items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListChecks />
          </EmptyMedia>
          <EmptyTitle>
            {filtered ? "No issues match" : "No issues or snags yet"}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try another status, priority or date."
              : "Record each problem on site with who must fix it and by when. Past its Due Date an open issue shows Delayed."}
          </EmptyDescription>
        </EmptyHeader>
        {!filtered && newHref != null && (
          <EmptyContent>
            <Link href={newHref} className={buttonVariants({ size: "sm" })}>
              Add Issue
            </Link>
          </EmptyContent>
        )}
      </Empty>
    );

  const check = (issue: Issue) =>
    selecting ? (
      <Checkbox
        aria-label={`Select ${issue.number}`}
        checked={selected.has(issue.id)}
        disabled={issue.storedStatus === "closed"}
        onCheckedChange={(on) => {
          toggle(issue.id, on);
        }}
      />
    ) : null;
  const href = (issue: Issue) => issuesPath(projectId, issue.id);

  return (
    <div className={cn("min-w-0 space-y-3", className)}>
      <p className="text-muted-foreground text-sm">
        {plural(data.total, "issue")}
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
      {selecting && chosen.length > 0 && (
        <div className="bg-muted/60 sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border p-2">
          <span className="text-sm">{chosen.length} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {canSolve && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={solvable.length === 0 || bulk.isPending}
                onClick={() => {
                  run("solve");
                }}
              >
                Mark As Solved ({solvable.length})
              </Button>
            )}
            {canVerify && (
              <Button
                type="button"
                size="sm"
                disabled={verifiable.length === 0 || bulk.isPending}
                onClick={() => {
                  run("verify");
                }}
              >
                Verify ({verifiable.length})
              </Button>
            )}
          </div>
        </div>
      )}
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table aria-label="Issues & Snags">
          <TableHeader>
            <TableRow>
              {selecting && (
                <TableHead className="w-10">
                  <span className="sr-only">Select</span>
                </TableHead>
              )}
              <TableHead>Number</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Assigned to</TableHead>
              <TableHead>Issue Date</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((issue) => (
              <TableRow key={issue.id}>
                {selecting && <TableCell>{check(issue)}</TableCell>}
                <TableCell className="font-medium whitespace-nowrap">
                  <Link href={href(issue)} className="hover:underline">
                    {issue.number}
                  </Link>
                </TableCell>
                <TableCell className="max-w-72">
                  <div className="truncate">{issue.details}</div>
                  <div className="text-muted-foreground truncate text-xs">
                    {[issue.category?.name, issue.contractor?.name]
                      .filter((part) => part != null)
                      .join(" · ") || "—"}
                  </div>
                </TableCell>
                <TableCell>
                  {issue.priority == null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <PriorityChip priority={issue.priority} />
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {issue.assignee?.name ?? "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(issue.issueDate)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {issue.dueDate == null ? "—" : formatDate(issue.dueDate)}
                </TableCell>
                <TableCell>
                  <IssueStatusBadge status={issue.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul aria-label="Issues & Snags" className="space-y-2 md:hidden">
        {data.items.map((issue) => (
          <li key={issue.id} className="rounded-lg border p-3">
            <div className="flex items-start gap-3">
              {check(issue)}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={href(issue)}
                    className="font-medium hover:underline"
                  >
                    {issue.number}
                  </Link>
                  <IssueStatusBadge status={issue.status} />
                </div>
                <p className="line-clamp-2 text-sm break-words">
                  {issue.details}
                </p>
                <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                  {issue.priority != null && (
                    <PriorityChip priority={issue.priority} />
                  )}
                  <span>
                    {issue.dueDate == null
                      ? formatDate(issue.issueDate)
                      : `Due ${formatDate(issue.dueDate)}`}
                  </span>
                  {issue.assignee != null && (
                    <span>· {issue.assignee.name ?? "A former member"}</span>
                  )}
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
    </div>
  );
}
