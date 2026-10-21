"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Plus, Settings, Truck } from "lucide-react";
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
import { ReasonDialog } from "@/components/procurement/purchase-requests/reason-dialog";
import {
  SheetApprovalBadge,
  shiftLabel,
} from "@/components/site-work/worksheets/worksheet-format";
import { fieldForCode } from "@/lib/server-errors";
import {
  equipmentSheetSettingsQuery,
  equipmentSheetsPath,
  equipmentSheetsQuery,
  useBulkDecideEquipmentSheets,
  type EquipmentSheet,
  type EquipmentSheetFilter,
  type EquipmentSheetPage,
} from "@/src/queries/equipment-sheets";
import {
  canInSiteWork,
  siteWorkAccessQuery,
} from "@/src/queries/site-work-access";
import {
  EQUIPMENT_OWNERSHIPS,
  OWNERSHIP_LABELS,
  type EquipmentOwnership,
} from "@/src/site-work/domain/equipment";
import {
  SHEET_APPROVAL_LABELS,
  SHEET_APPROVAL_STATUSES,
  type SheetApprovalStatus,
} from "@/src/site-work/domain/shift";

import { EquipmentSheetActions } from "./equipment-sheet-actions";
import {
  hoursText,
  moneyText,
  OwnershipBadge,
  usageText,
} from "./equipment-sheet-format";
import { trimDecimal } from "./equipment-sheet-live";
import { EquipmentSheetSettingsDialog } from "./equipment-sheet-settings-dialog";
import { EquipmentSheetRowsSkeleton } from "@/components/site-work/site-work-skeletons";

type Filters = {
  date: DateFilterValue;
  equipmentId: string;
  ownership: EquipmentOwnership | "";
  createdBy: string;
  approvalStatus: SheetApprovalStatus | "";
};

const NO_FILTERS: Filters = {
  date: NO_DATE_FILTER,
  equipmentId: "",
  ownership: "",
  createdBy: "",
  approvalStatus: "",
};

function toQuery(projectId: string, filters: Filters): EquipmentSheetFilter {
  return {
    projectId,
    from: filters.date.from,
    to: filters.date.to,
    equipmentId: filters.equipmentId,
    ownership: filters.ownership,
    createdBy: filters.createdBy,
    approvalStatus: filters.approvalStatus,
  };
}

/** "85.5 h worked · 120 km · 14 trips" over every sheet the filters match. */
function totalsLine(totals: EquipmentSheetPage["totals"]): string {
  const parts = [`${trimDecimal(totals.usageHours)} h worked`];
  if (Number(totals.distanceKm) > 0)
    parts.push(`${trimDecimal(totals.distanceKm)} km`);
  if (totals.trips > 0) parts.push(`${String(totals.trips)} trips`);
  if (Number(totals.idleHours) > 0)
    parts.push(`${trimDecimal(totals.idleHours)} h idle`);
  if (Number(totals.breakdownHours) > 0)
    parts.push(`${trimDecimal(totals.breakdownHours)} h breakdown`);
  return parts.join(" · ");
}

/**
 * The Usage sheets tab of a Project's Equipment module (CM-604): filters
 * by date, equipment, ownership, Filled By and approval with the totals;
 * owned / rented badges; bulk approve / reject while approval is on; the
 * gear opens the form settings for members with Update.
 */
export function EquipmentSheetsPage({
  projectId,
  today = localToday(),
}: {
  projectId: string;
  /** `YYYY-MM-DD`; the device's today unless a story fixes it. */
  today?: string;
}) {
  const access = useQuery(siteWorkAccessQuery(projectId)).data;
  const settings = useQuery(equipmentSheetSettingsQuery(projectId)).data;
  const may = (flag: Parameters<typeof canInSiteWork>[2]) =>
    access != null && canInSiteWork(access, "site_work.equipment_usage", flag);
  const approval = settings?.approvalEnabled === true;
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [cursor, setCursor] = useState<EquipmentSheetFilter["cursor"]>(null);
  const [bulk, setBulk] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  // Filter and page changes keep the old rows on screen, dimmed (ADR-0047).
  const [isPending, startTransition] = useTransition();
  const change = (next: Partial<Filters>) => {
    startTransition(() => {
      setFilters((current) => ({ ...current, ...next }));
      setCursor(null);
    });
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Equipment Usage sheets</h2>
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
              aria-label="Equipment Usage settings"
              onClick={() => {
                setConfiguring(true);
              }}
            >
              <Settings aria-hidden="true" />
            </Button>
          )}
          {may("create") && (
            <Link
              href={equipmentSheetsPath(projectId, "/new")}
              className={buttonVariants({ size: "sm" })}
            >
              <Plus aria-hidden="true" />
              Add usage sheet
            </Link>
          )}
        </div>
      </div>
      <Suspense
        fallback={
          <EquipmentSheetRowsSkeleton
            approval={approval}
            bulk={bulk && approval}
          />
        }
      >
        <SheetRows
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
          className={cn(isPending && "opacity-60 transition-opacity")}
        />
      </Suspense>
      <EquipmentSheetSettingsDialog
        projectId={projectId}
        open={configuring}
        onOpenChange={setConfiguring}
      />
    </div>
  );
}

function SheetRows({
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
  className,
}: {
  projectId: string;
  today: string;
  filters: Filters;
  cursor: EquipmentSheetFilter["cursor"];
  approval: boolean;
  bulk: boolean;
  canApprove: boolean;
  canReject: boolean;
  canCreate: boolean;
  onFilters: (next: Partial<Filters>) => void;
  onPage: (cursor: EquipmentSheetFilter["cursor"]) => void;
  className?: string;
}) {
  const { data } = useSuspenseQuery(
    equipmentSheetsQuery({ ...toQuery(projectId, filters), cursor }),
  );
  const decide = useBulkDecideEquipmentSheets();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const showApproval =
    approval ||
    filters.approvalStatus !== "" ||
    data.items.some((sheet) => sheet.approvalStatus !== "not_required");
  // Hire cost shows when the viewer has Financial and a rented sheet is listed.
  const showHire = data.items.some((sheet) => sheet.hireCost != null);
  const selectable = (sheet: EquipmentSheet) =>
    sheet.approvalStatus === "pending";
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
        `${String(result.decided)} usage ${result.decided === 1 ? "sheet" : "sheets"} ${approve ? "approved" : "rejected"}.`,
      );
    } catch (failure) {
      throw new Error(fieldForCode(failure, {}).message, { cause: failure });
    }
  };

  const filterBar = (
    <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
      <DateFilter
        idPrefix="equipment-sheets"
        value={filters.date}
        today={today}
        onChange={(date) => {
          onFilters({ date });
        }}
      />
      <FilterSelect
        id="equipment-sheets-equipment"
        label="Equipment"
        value={filters.equipmentId}
        options={data.facets.equipment.map((item) => ({
          value: item.id,
          label: `${item.name} · ${item.equipmentNumber}`,
        }))}
        onChange={(equipmentId) => {
          onFilters({ equipmentId });
        }}
      />
      <FilterSelect
        id="equipment-sheets-ownership"
        label="Ownership"
        value={filters.ownership}
        options={EQUIPMENT_OWNERSHIPS.map((ownership) => ({
          value: ownership,
          label: OWNERSHIP_LABELS[ownership],
        }))}
        onChange={(value) => {
          onFilters({ ownership: value as EquipmentOwnership | "" });
        }}
      />
      <FilterSelect
        id="equipment-sheets-filled-by"
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
      {showApproval && (
        <FilterSelect
          id="equipment-sheets-approval"
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
      <div className={cn("space-y-4", className)}>
        {(filtered || data.total > 0) && filterBar}
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Truck />
            </EmptyMedia>
            <EmptyTitle>
              {filtered ? "No usage sheets match" : "No usage sheets yet"}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Try another date, machine or ownership."
                : "Record each machine's day: the hours or distance it worked, idle and breakdown time, fuel and hire."}
            </EmptyDescription>
          </EmptyHeader>
          {!filtered && canCreate && (
            <EmptyContent>
              <Link
                href={equipmentSheetsPath(projectId, "/new")}
                className={buttonVariants({ size: "sm" })}
              >
                Add usage sheet
              </Link>
            </EmptyContent>
          )}
        </Empty>
      </div>
    );

  const check = (sheet: EquipmentSheet) =>
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
  const itemPath = (sheet: EquipmentSheet) =>
    equipmentSheetsPath(projectId, `/${sheet.id}`);

  return (
    <div className={cn("space-y-3", className)}>
      {filterBar}
      <p className="text-muted-foreground text-sm">
        {data.total} usage {data.total === 1 ? "sheet" : "sheets"} ·{" "}
        {totalsLine(data.totals)}
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
            {chosen.length} selected · only pending sheets can be decided
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
        <Table aria-label="Equipment Usage sheets">
          <TableHeader>
            <TableRow>
              {bulk && (
                <TableHead className="w-10">
                  <span className="sr-only">Select</span>
                </TableHead>
              )}
              <TableHead>Number</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Equipment</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Idle</TableHead>
              <TableHead>Breakdown</TableHead>
              {showHire && <TableHead className="text-right">Hire</TableHead>}
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
                  <Link href={itemPath(sheet)} className="hover:underline">
                    {sheet.number}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(sheet.sheetDate)}
                  <div className="text-muted-foreground text-xs">
                    {shiftLabel(sheet.shift)}
                  </div>
                </TableCell>
                <TableCell className="max-w-64">
                  <div className="flex items-center gap-2">
                    <span className="truncate">{sheet.equipment.name}</span>
                    <OwnershipBadge ownership={sheet.ownership} />
                  </div>
                  <div className="text-muted-foreground truncate text-xs">
                    {sheet.equipment.equipmentNumber}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {usageText(sheet)}
                  {sheet.fuelOverrun && (
                    <div className="text-destructive text-xs">Fuel overrun</div>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap tabular-nums">
                  {hoursText(sheet.idleHours)}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap tabular-nums">
                  {hoursText(sheet.breakdownHours)}
                </TableCell>
                {showHire && (
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {moneyText(sheet.hireCost)}
                  </TableCell>
                )}
                {showApproval && (
                  <TableCell>
                    <SheetApprovalBadge status={sheet.approvalStatus} />
                  </TableCell>
                )}
                <TableCell className="text-muted-foreground">
                  {sheet.createdBy.name ?? "—"}
                </TableCell>
                <TableCell>
                  <EquipmentSheetActions
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
      <ul aria-label="Equipment Usage sheets" className="space-y-2 md:hidden">
        {data.items.map((sheet) => (
          <li key={sheet.id} className="rounded-lg border p-3">
            <div className="flex items-start gap-3">
              {check(sheet)}
              <div className="min-w-0 flex-1">
                <Link
                  href={itemPath(sheet)}
                  className="font-medium hover:underline"
                >
                  {sheet.number}
                </Link>
                <p className="text-muted-foreground text-xs">
                  {formatDate(sheet.sheetDate)} · {shiftLabel(sheet.shift)}
                </p>
                <div className="mt-1 flex min-w-0 items-center gap-2 text-sm">
                  <span className="truncate">
                    {sheet.equipment.name} · {sheet.equipment.equipmentNumber}
                  </span>
                  <OwnershipBadge ownership={sheet.ownership} />
                </div>
                <p className="text-muted-foreground truncate text-xs">
                  {usageText(sheet)} · idle {hoursText(sheet.idleHours)}
                  {sheet.hireCost != null &&
                    ` · hire ${moneyText(sheet.hireCost)}`}
                </p>
                {sheet.fuelOverrun && (
                  <p className="text-destructive text-xs">Fuel overrun</p>
                )}
                {showApproval && (
                  <div className="mt-2">
                    <SheetApprovalBadge status={sheet.approvalStatus} />
                  </div>
                )}
              </div>
              <EquipmentSheetActions
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
        title={`Reject ${String(chosen.length)} usage ${chosen.length === 1 ? "sheet" : "sheets"}?`}
        description="All of them are rejected with this reason, or none is."
        action="Reject"
        onSubmit={(reason) => bulkDecide(false, reason)}
      />
    </div>
  );
}
