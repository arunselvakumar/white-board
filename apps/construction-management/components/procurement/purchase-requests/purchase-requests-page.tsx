"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ClipboardList, Plus } from "lucide-react";
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
import { localToday } from "@/components/payments/payment-format";
import { formatDate } from "@/components/payments/payment-format";
import { fieldForCode } from "@/lib/server-errors";
import {
  canIn,
  procurementAccessQuery,
} from "@/src/queries/procurement-access";
import {
  purchaseRequestsQuery,
  useBulkDecidePurchaseRequests,
  type PurchaseRequest,
  type PurchaseRequestFilter,
} from "@/src/queries/purchase-requests";
import { LOCATION_TYPES } from "@/src/shared-kernel/location-ref";

import {
  DateFilter,
  NO_DATE_FILTER,
  type DateFilterValue,
} from "./date-filter";
import { FilterSelect } from "./filter-select";
import {
  purchaseRequestsPath,
  PurchaseRequestActions,
} from "./purchase-request-actions";
import {
  ApprovalBadge,
  chipFilter,
  OrderBadge,
  quantityText,
  STATUS_CHIPS,
  type StatusChip,
} from "./purchase-request-format";
import { ReasonDialog } from "./reason-dialog";

type Filters = {
  date: DateFilterValue;
  chip: StatusChip;
  categoryId: string;
  materialId: string;
  createdBy: string;
  locationType: string;
};

const NO_FILTERS: Filters = {
  date: NO_DATE_FILTER,
  chip: "all",
  categoryId: "",
  materialId: "",
  createdBy: "",
  locationType: "",
};

function toQuery(projectId: string, filters: Filters): PurchaseRequestFilter {
  return {
    projectId,
    from: filters.date.from,
    to: filters.date.to,
    ...chipFilter(filters.chip),
    categoryId: filters.categoryId,
    materialId: filters.materialId,
    createdBy: filters.createdBy,
    locationType: filters.locationType,
  };
}

function itemsLine(pr: PurchaseRequest): string {
  const first = pr.items
    .slice(0, 2)
    .map(
      (item) =>
        `${item.materialName} ${quantityText(item.quantity)} ${item.uomName}`,
    )
    .join(", ");
  const more = pr.items.length - 2;
  return more > 0 ? `${first} +${String(more)} more` : first;
}

/**
 * A Project's Purchase Requests (CM-503): filters by date, status chip,
 * category, material, creator and location type; bulk approval mode;
 * row actions. Add Purchase Request opens the three-step wizard.
 */
export function PurchaseRequestsPage({
  projectId,
  today = localToday(),
}: {
  projectId: string;
  /** `YYYY-MM-DD`; the device's today unless a story fixes it. */
  today?: string;
}) {
  const access = useQuery(procurementAccessQuery(projectId)).data;
  const may = (flag: Parameters<typeof canIn>[2]) =>
    access != null && canIn(access, "procurement.purchase_requests", flag);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [cursor, setCursor] = useState<PurchaseRequestFilter["cursor"]>(null);
  const [bulk, setBulk] = useState(false);
  // A transition keeps the current rows (and the filter bar) on screen
  // while the next page loads, instead of the Suspense fallback.
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
        <h2 className="text-lg font-semibold">Purchase Requests</h2>
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
              href={purchaseRequestsPath(projectId, "/new")}
              className={buttonVariants({ size: "sm" })}
            >
              <Plus aria-hidden="true" />
              Add Purchase Request
            </Link>
          )}
        </div>
      </div>
      <ToggleGroup
        aria-label="Status"
        value={[filters.chip]}
        onValueChange={(value: string[]) => {
          const next = value[0] as StatusChip | undefined;
          if (next != null) change({ chip: next });
        }}
        variant="outline"
        size="sm"
        className="flex-wrap"
      >
        {STATUS_CHIPS.map((chip) => (
          <ToggleGroupItem key={chip.key} value={chip.key}>
            {chip.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Suspense fallback={<ListSkeleton />}>
        <PurchaseRequestRows
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

function ListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

function PurchaseRequestRows({
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
  cursor: PurchaseRequestFilter["cursor"];
  bulk: boolean;
  canApprove: boolean;
  canReject: boolean;
  canCreate: boolean;
  onFilters: (next: Partial<Filters>) => void;
  onPage: (cursor: PurchaseRequestFilter["cursor"]) => void;
}) {
  const { data } = useSuspenseQuery(
    purchaseRequestsQuery({ ...toQuery(projectId, filters), cursor }),
  );
  const decide = useBulkDecidePurchaseRequests();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const selectable = (pr: PurchaseRequest) => pr.approvalStatus === "pending";
  const chosen = data.items.filter(
    (pr) => selected.has(pr.id) && selectable(pr),
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
        ids: chosen.map((pr) => pr.id),
        approve,
        reason,
      });
      setSelected(new Set());
      setNotice(
        `${String(result.decided)} ${result.decided === 1 ? "request" : "requests"} ${approve ? "approved" : "rejected"}.`,
      );
    } catch (failure) {
      throw new Error(fieldForCode(failure, {}).message, { cause: failure });
    }
  };

  const filterBar = (
    <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
      <DateFilter
        idPrefix="pr"
        value={filters.date}
        today={today}
        onChange={(date) => {
          onFilters({ date });
        }}
      />
      <FilterSelect
        id="pr-category"
        label="Material Category"
        value={filters.categoryId}
        options={data.facets.categories.map((item) => ({
          value: item.id,
          label: item.name,
        }))}
        onChange={(categoryId) => {
          onFilters({ categoryId });
        }}
      />
      <FilterSelect
        id="pr-material"
        label="Material"
        value={filters.materialId}
        options={data.facets.materials.map((item) => ({
          value: item.id,
          label: item.name,
        }))}
        onChange={(materialId) => {
          onFilters({ materialId });
        }}
      />
      <FilterSelect
        id="pr-created-by"
        label="Created By"
        value={filters.createdBy}
        options={data.facets.creators.map((item) => ({
          value: item.userId,
          label: item.name,
        }))}
        onChange={(createdBy) => {
          onFilters({ createdBy });
        }}
      />
      <FilterSelect
        id="pr-location-type"
        label="Location Type"
        value={filters.locationType}
        options={LOCATION_TYPES.map((item) => ({
          value: item.key,
          label: item.label,
        }))}
        onChange={(locationType) => {
          onFilters({ locationType });
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
              <ClipboardList />
            </EmptyMedia>
            <EmptyTitle>
              {filtered
                ? "No Purchase Requests match"
                : "No Purchase Requests yet"}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Try another status, date or material."
                : "Ask for the materials the site needs. An approver approves the request, then a Purchase Order orders it."}
            </EmptyDescription>
          </EmptyHeader>
          {!filtered && canCreate && (
            <EmptyContent>
              <Link
                href={purchaseRequestsPath(projectId, "/new")}
                className={buttonVariants({ size: "sm" })}
              >
                Add Purchase Request
              </Link>
            </EmptyContent>
          )}
        </Empty>
      </div>
    );

  const check = (pr: PurchaseRequest) =>
    bulk ? (
      <Checkbox
        aria-label={`Select ${pr.number}`}
        disabled={!selectable(pr)}
        checked={selected.has(pr.id)}
        onCheckedChange={(on) => {
          toggle(pr.id, on);
        }}
      />
    ) : null;

  return (
    <div className="space-y-3">
      {filterBar}
      <p className="text-muted-foreground text-sm">
        {data.total}{" "}
        {data.total === 1 ? "Purchase Request" : "Purchase Requests"}
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
        <Table aria-label="Purchase Requests">
          <TableHeader>
            <TableRow>
              {bulk && (
                <TableHead className="w-10">
                  <span className="sr-only">Select</span>
                </TableHead>
              )}
              <TableHead>Number</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Materials</TableHead>
              <TableHead>Required</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created By</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((pr) => (
              <TableRow key={pr.id}>
                {bulk && <TableCell>{check(pr)}</TableCell>}
                <TableCell className="font-medium whitespace-nowrap">
                  <Link
                    href={purchaseRequestsPath(projectId, `/${pr.id}`)}
                    className="hover:underline"
                  >
                    {pr.number}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(pr.requestDate)}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-72 truncate">
                  {itemsLine(pr)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {pr.requiredDate == null ? "—" : formatDate(pr.requiredDate)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <ApprovalBadge status={pr.approvalStatus} />
                    <OrderBadge status={pr.orderStatus} />
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {pr.createdBy.name ?? "—"}
                </TableCell>
                <TableCell>
                  <PurchaseRequestActions
                    pr={pr}
                    variant="menu"
                    onError={setError}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul aria-label="Purchase Requests" className="space-y-2 md:hidden">
        {data.items.map((pr) => (
          <li key={pr.id} className="rounded-lg border p-3">
            <div className="flex items-start gap-3">
              {check(pr)}
              <div className="min-w-0 flex-1">
                <Link
                  href={purchaseRequestsPath(projectId, `/${pr.id}`)}
                  className="font-medium hover:underline"
                >
                  {pr.number}
                </Link>
                <p className="text-muted-foreground text-xs">
                  {formatDate(pr.requestDate)}
                  {pr.requiredDate != null &&
                    ` · needed ${formatDate(pr.requiredDate)}`}
                </p>
                <p className="text-muted-foreground mt-1 truncate text-sm">
                  {itemsLine(pr)}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <ApprovalBadge status={pr.approvalStatus} />
                  <OrderBadge status={pr.orderStatus} />
                </div>
              </div>
              <PurchaseRequestActions
                pr={pr}
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
        title={`Reject ${String(chosen.length)} ${chosen.length === 1 ? "request" : "requests"}?`}
        description="All of them are rejected with this reason, or none is."
        action="Reject"
        onSubmit={(reason) => bulkDecide(false, reason)}
      />
    </div>
  );
}
