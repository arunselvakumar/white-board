"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ClipboardList, Plus, Settings } from "lucide-react";
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

import { FormAlert } from "@/components/auth/form-alert";
import { formatDate, localToday } from "@/components/payments/payment-format";
import {
  DateFilter,
  NO_DATE_FILTER,
  type DateFilterValue,
} from "@/components/procurement/purchase-requests/date-filter";
import { FilterSelect } from "@/components/procurement/purchase-requests/filter-select";
import { ReasonDialog } from "@/components/procurement/purchase-requests/reason-dialog";
import { fieldForCode } from "@/lib/server-errors";
import {
  canInSiteWork,
  siteWorkAccessQuery,
} from "@/src/queries/site-work-access";
import {
  useBulkDecideWorksheets,
  worksheetSettingsQuery,
  worksheetsQuery,
  type Worksheet,
  type WorksheetFilter,
} from "@/src/queries/worksheets";
import {
  SHEET_APPROVAL_LABELS,
  SHEET_APPROVAL_STATUSES,
  type SheetApprovalStatus,
} from "@/src/site-work/domain/shift";

import { WorksheetActions } from "./worksheet-actions";
import {
  headcountText,
  SheetApprovalBadge,
  shiftLabel,
  worksheetsPath,
} from "./worksheet-format";
import { WorksheetSettingsDialog } from "./worksheet-settings-dialog";

type Filters = {
  date: DateFilterValue;
  createdBy: string;
  contractorId: string;
  departmentId: string;
  approvalStatus: SheetApprovalStatus | "";
};

const NO_FILTERS: Filters = {
  date: NO_DATE_FILTER,
  createdBy: "",
  contractorId: "",
  departmentId: "",
  approvalStatus: "",
};

function toQuery(projectId: string, filters: Filters): WorksheetFilter {
  return {
    projectId,
    from: filters.date.from,
    to: filters.date.to,
    createdBy: filters.createdBy,
    contractorId: filters.contractorId,
    departmentId: filters.departmentId,
    approvalStatus: filters.approvalStatus,
  };
}

function materialsLine(sheet: Worksheet): string {
  if (sheet.materials.length === 0) return "—";
  const first = sheet.materials[0]?.materialName ?? "";
  const more = sheet.materials.length - 1;
  return more > 0 ? `${first} +${String(more)} more` : first;
}

/**
 * A Project's Daily Worksheets (CM-602): filters by date, Filled By,
 * Contractor, Department and approval; bulk approve / reject for
 * approvers when approval is on; the gear opens the form settings for
 * members with Update.
 */
export function WorksheetsPage({
  projectId,
  today = localToday(),
}: {
  projectId: string;
  /** `YYYY-MM-DD`; the device's today unless a story fixes it. */
  today?: string;
}) {
  const access = useQuery(siteWorkAccessQuery(projectId)).data;
  const settings = useQuery(worksheetSettingsQuery(projectId)).data;
  const may = (flag: Parameters<typeof canInSiteWork>[2]) =>
    access != null && canInSiteWork(access, "site_work.daily_worksheet", flag);
  const approval = settings?.approvalEnabled === true;
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [cursor, setCursor] = useState<WorksheetFilter["cursor"]>(null);
  const [bulk, setBulk] = useState(false);
  const [configuring, setConfiguring] = useState(false);
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
        <h2 className="text-lg font-semibold">Daily Worksheet</h2>
        <div className="flex flex-wrap gap-2">
          {approval && (may("approve") || may("reject")) && (
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
          {may("update") && (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Worksheet settings"
              onClick={() => {
                setConfiguring(true);
              }}
            >
              <Settings aria-hidden="true" />
            </Button>
          )}
          {may("create") && (
            <Link
              href={worksheetsPath(projectId, "/new")}
              className={buttonVariants({ size: "sm" })}
            >
              <Plus aria-hidden="true" />
              Add Worksheet
            </Link>
          )}
        </div>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <WorksheetRows
          projectId={projectId}
          today={today}
          filters={filters}
          cursor={cursor}
          approval={approval}
          bulk={bulk && approval}
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
      <WorksheetSettingsDialog
        projectId={projectId}
        open={configuring}
        onOpenChange={setConfiguring}
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

function WorksheetRows({
  projectId,
  today,
  filters,
  cursor,
  approval,
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
  cursor: WorksheetFilter["cursor"];
  approval: boolean;
  bulk: boolean;
  canApprove: boolean;
  canReject: boolean;
  canCreate: boolean;
  onFilters: (next: Partial<Filters>) => void;
  onPage: (cursor: WorksheetFilter["cursor"]) => void;
}) {
  const { data } = useSuspenseQuery(
    worksheetsQuery({ ...toQuery(projectId, filters), cursor }),
  );
  const decide = useBulkDecideWorksheets();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  // Approval columns show while approval is on, or once any sheet carries a decision.
  const showApproval =
    approval ||
    filters.approvalStatus !== "" ||
    data.items.some((sheet) => sheet.approvalStatus !== "not_required");
  const selectable = (sheet: Worksheet) => sheet.approvalStatus === "pending";
  const chosen = data.items.filter(
    (sheet) => selected.has(sheet.id) && selectable(sheet),
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
        ids: chosen.map((sheet) => sheet.id),
        approve,
        reason,
      });
      setSelected(new Set());
      setNotice(
        `${String(result.decided)} ${result.decided === 1 ? "worksheet" : "worksheets"} ${approve ? "approved" : "rejected"}.`,
      );
    } catch (failure) {
      throw new Error(fieldForCode(failure, {}).message, { cause: failure });
    }
  };

  const filterBar = (
    <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
      <DateFilter
        idPrefix="worksheets"
        value={filters.date}
        today={today}
        onChange={(date) => {
          onFilters({ date });
        }}
      />
      <FilterSelect
        id="worksheets-filled-by"
        label="Filled By"
        value={filters.createdBy}
        options={data.facets.filledBy.map((item) => ({
          value: item.userId,
          label: item.name,
        }))}
        onChange={(createdBy) => {
          onFilters({ createdBy });
        }}
      />
      <FilterSelect
        id="worksheets-contractor"
        label="Contractor"
        value={filters.contractorId}
        options={data.facets.contractors.map((item) => ({
          value: item.id,
          label: item.name,
        }))}
        onChange={(contractorId) => {
          onFilters({ contractorId });
        }}
      />
      <FilterSelect
        id="worksheets-department"
        label="Department"
        value={filters.departmentId}
        options={data.facets.departments.map((item) => ({
          value: item.id,
          label: item.name,
        }))}
        onChange={(departmentId) => {
          onFilters({ departmentId });
        }}
      />
      {showApproval && (
        <FilterSelect
          id="worksheets-approval"
          label="Approval"
          value={filters.approvalStatus}
          options={SHEET_APPROVAL_STATUSES.map((status) => ({
            value: status,
            label: SHEET_APPROVAL_LABELS[status],
          }))}
          onChange={(value) => {
            onFilters({ approvalStatus: value as SheetApprovalStatus | "" });
          }}
        />
      )}
    </div>
  );

  if (data.items.length === 0)
    return (
      <div className="space-y-4">
        {(filtered || data.total > 0) && filterBar}
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardList />
            </EmptyMedia>
            <EmptyTitle>
              {filtered ? "No worksheets match" : "No worksheets yet"}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Try another date, contractor or department."
                : "Record each crew's day: where they worked, how many came, and the material they used."}
            </EmptyDescription>
          </EmptyHeader>
          {!filtered && canCreate && (
            <EmptyContent>
              <Link
                href={worksheetsPath(projectId, "/new")}
                className={buttonVariants({ size: "sm" })}
              >
                Add Worksheet
              </Link>
            </EmptyContent>
          )}
        </Empty>
      </div>
    );

  const check = (sheet: Worksheet) =>
    bulk ? (
      <Checkbox
        aria-label={`Select ${sheet.number}`}
        disabled={!selectable(sheet)}
        checked={selected.has(sheet.id)}
        onCheckedChange={(on) => {
          toggle(sheet.id, on);
        }}
      />
    ) : null;

  return (
    <div className="space-y-3">
      {filterBar}
      <p className="text-muted-foreground text-sm">
        {data.total} {data.total === 1 ? "worksheet" : "worksheets"}
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
            {chosen.length} selected · only pending worksheets can be decided
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
        <Table aria-label="Daily Worksheets">
          <TableHeader>
            <TableRow>
              {bulk && (
                <TableHead className="w-10">
                  <span className="sr-only">Select</span>
                </TableHead>
              )}
              <TableHead>Number</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Contractor</TableHead>
              <TableHead>Shift</TableHead>
              <TableHead>Labour</TableHead>
              <TableHead>Materials</TableHead>
              {showApproval && <TableHead>Status</TableHead>}
              <TableHead>Filled By</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((sheet) => (
              <TableRow key={sheet.id}>
                {bulk && <TableCell>{check(sheet)}</TableCell>}
                <TableCell className="font-medium whitespace-nowrap">
                  <Link
                    href={worksheetsPath(projectId, `/${sheet.id}`)}
                    className="hover:underline"
                  >
                    {sheet.number}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(sheet.sheetDate)}
                </TableCell>
                <TableCell className="max-w-56">
                  <div className="truncate">{sheet.contractor.name ?? "—"}</div>
                  <div className="text-muted-foreground truncate text-xs">
                    {sheet.department.name ?? "—"}
                    {sheet.workType?.name != null &&
                      ` · ${sheet.workType.name}`}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {shiftLabel(sheet.shift)}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {headcountText(sheet)}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-56 truncate">
                  {materialsLine(sheet)}
                </TableCell>
                {showApproval && (
                  <TableCell>
                    <SheetApprovalBadge status={sheet.approvalStatus} />
                  </TableCell>
                )}
                <TableCell className="text-muted-foreground">
                  {sheet.createdBy.name ?? "—"}
                </TableCell>
                <TableCell>
                  <WorksheetActions
                    sheet={sheet}
                    variant="menu"
                    onError={setError}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul aria-label="Daily Worksheets" className="space-y-2 md:hidden">
        {data.items.map((sheet) => (
          <li key={sheet.id} className="rounded-lg border p-3">
            <div className="flex items-start gap-3">
              {check(sheet)}
              <div className="min-w-0 flex-1">
                <Link
                  href={worksheetsPath(projectId, `/${sheet.id}`)}
                  className="font-medium hover:underline"
                >
                  {sheet.number}
                </Link>
                <p className="text-muted-foreground text-xs">
                  {formatDate(sheet.sheetDate)} · {shiftLabel(sheet.shift)}
                </p>
                <p className="mt-1 truncate text-sm">
                  {sheet.contractor.name ?? "—"} ·{" "}
                  {sheet.department.name ?? "—"}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {headcountText(sheet)} · {materialsLine(sheet)}
                </p>
                {showApproval && (
                  <div className="mt-2">
                    <SheetApprovalBadge status={sheet.approvalStatus} />
                  </div>
                )}
              </div>
              <WorksheetActions
                sheet={sheet}
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
        title={`Reject ${String(chosen.length)} ${chosen.length === 1 ? "worksheet" : "worksheets"}?`}
        description="All of them are rejected with this reason, or none is."
        action="Reject"
        onSubmit={(reason) => bulkDecide(false, reason)}
      />
    </div>
  );
}
