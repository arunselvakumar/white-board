"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  FileSpreadsheet,
  MoreHorizontal,
  Plus,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, useTransition } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
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

import { localToday } from "@/components/payments/payment-format";
import { FilterSelect } from "@/components/procurement/purchase-requests/filter-select";
import { canInSales, salesAccessQuery } from "@/src/queries/sales-access";
import {
  inquiriesPath,
  inquiriesQuery,
  inquiryFormOptionsQuery,
  type Inquiry,
  type InquiryFilters,
} from "@/src/queries/sales-inquiries";
import {
  FOLLOW_UP_DUE_LABELS,
  FOLLOW_UP_DUES,
  INQUIRY_STATUS_LABELS,
  INQUIRY_STATUSES,
  INTEREST_TYPE_LABELS,
  INTEREST_TYPES,
  type FollowUpDue,
  type InquiryStatus,
  type InterestType,
} from "@/src/sales/domain/sales-terms";

import {
  formatMobile,
  InquiryStatusBadge,
  InterestChip,
  NextFollowUp,
} from "./inquiry-parts";
import { ImportInquiriesDialog } from "./import-inquiries-dialog";
import { InquiryQuickAddDialog } from "./inquiry-quick-add-dialog";

type Filters = {
  statuses: InquiryStatus[];
  due: FollowUpDue | "";
  funnelStageId: string;
  interestType: string;
  leadSourceId: string;
  assigneeMemberId: string;
  search: string;
};

const NO_FILTERS: Filters = {
  statuses: [],
  due: "",
  funnelStageId: "",
  interestType: "",
  leadSourceId: "",
  assigneeMemberId: "",
  search: "",
};

function toQuery(filters: Filters): InquiryFilters {
  return {
    statuses: filters.statuses,
    due: filters.due,
    funnelStageId: filters.funnelStageId,
    interestTypes:
      filters.interestType === "" ? [] : [filters.interestType as InterestType],
    leadSourceId: filters.leadSourceId,
    assigneeMemberId: filters.assigneeMemberId,
    search: filters.search,
  };
}

function isDue(value: string | null): value is FollowUpDue {
  return value != null && (FOLLOW_UP_DUES as readonly string[]).includes(value);
}

function inquiries(n: number): string {
  return `${String(n)} ${n === 1 ? "inquiry" : "inquiries"}`;
}

/**
 * A Project's inquiries (CM-1003): status chips Open / Converted / Lost,
 * the Due filter Overdue / Today / Upcoming / No follow-up (open with
 * `?due=overdue` from a notification), filters by Funnel Stage, Interest
 * Type, Lead Source and Assignee, and a search on the name, mobile or
 * email; newest first in pages. **Add Inquiry** opens the full form,
 * **Quick add** a dialog. Without View all the server lists only the
 * viewer's own inquiries.
 */
export function InquiriesList({
  projectId,
  today = localToday(),
}: {
  projectId: string;
  /** `YYYY-MM-DD`; the device's today unless a story fixes it. */
  today?: string;
}) {
  const search = useSearchParams();
  const access = useQuery(salesAccessQuery(projectId)).data;
  const canCreate =
    access != null && canInSales(access, "sales.inquiries", "create");
  const [filters, setFilters] = useState<Filters>(() => {
    const due = search.get("due");
    return isDue(due) ? { ...NO_FILTERS, due } : NO_FILTERS;
  });
  const [cursor, setCursor] = useState<InquiryFilters["cursor"]>(null);
  const [quickAdd, setQuickAdd] = useState(false);
  const [importing, setImporting] = useState(false);
  const [, startTransition] = useTransition();
  const change = (next: Partial<Filters>) => {
    startTransition(() => {
      setFilters((current) => ({ ...current, ...next }));
      setCursor(null);
    });
  };
  const newHref = `${inquiriesPath(projectId)}/new`;
  return (
    <div className="flex w-full max-w-6xl min-w-0 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Inquiries</h2>
        {canCreate && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setQuickAdd(true);
              }}
            >
              <UserPlus aria-hidden="true" />
              Quick add
            </Button>
            <Link href={newHref} className={buttonVariants({ size: "sm" })}>
              <Plus aria-hidden="true" />
              Add Inquiry
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    aria-label="More inquiry actions"
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => {
                    setImporting(true);
                  }}
                >
                  <FileSpreadsheet aria-hidden="true" />
                  Import inquiries
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-wrap gap-2">
        <ToggleGroup
          multiple
          aria-label="Status"
          variant="outline"
          size="sm"
          className="flex-wrap"
          value={filters.statuses}
          onValueChange={(value: string[]) => {
            change({
              statuses: INQUIRY_STATUSES.filter((status) =>
                value.includes(status),
              ),
            });
          }}
        >
          {INQUIRY_STATUSES.map((status) => (
            <ToggleGroupItem key={status} value={status}>
              {INQUIRY_STATUS_LABELS[status]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          aria-label="Follow-up due"
          variant="outline"
          size="sm"
          className="flex-wrap"
          value={filters.due === "" ? [] : [filters.due]}
          onValueChange={(value: string[]) => {
            const picked = value.at(-1) ?? "";
            change({ due: isDue(picked) ? picked : "" });
          }}
        >
          {FOLLOW_UP_DUES.map((due) => (
            <ToggleGroupItem key={due} value={due}>
              {FOLLOW_UP_DUE_LABELS[due]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <Suspense fallback={<Skeleton className="h-14 w-full" />}>
        <FilterBar projectId={projectId} filters={filters} onChange={change} />
      </Suspense>
      <Suspense fallback={<ListSkeleton />}>
        <InquiryRows
          projectId={projectId}
          filters={filters}
          cursor={cursor}
          today={today}
          canCreate={canCreate}
          newHref={newHref}
          onPage={(next) => {
            startTransition(() => {
              setCursor(next);
            });
          }}
        />
      </Suspense>
      {canCreate && (
        <ImportInquiriesDialog
          projectId={projectId}
          open={importing}
          onClose={() => {
            setImporting(false);
          }}
        />
      )}
      {canCreate && (
        <Suspense fallback={null}>
          <InquiryQuickAddDialog
            projectId={projectId}
            open={quickAdd}
            onOpenChange={setQuickAdd}
          />
        </Suspense>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
}

function FilterBar({
  projectId,
  filters,
  onChange,
}: {
  projectId: string;
  filters: Filters;
  onChange: (next: Partial<Filters>) => void;
}) {
  // The box shows every keystroke at once; the list follows in a transition.
  const [search, setSearch] = useState(filters.search);
  const { data: options } = useSuspenseQuery(
    inquiryFormOptionsQuery(projectId),
  );
  const pick = (items: readonly { id: string; name: string }[]) =>
    items.map((item) => ({ value: item.id, label: item.name }));
  return (
    <div className="grid min-w-0 grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
      <FilterSelect
        id="inquiries-stage"
        label="Funnel Stage"
        allLabel="Any stage"
        value={filters.funnelStageId}
        options={pick(options.funnelStages)}
        onChange={(funnelStageId) => {
          onChange({ funnelStageId });
        }}
      />
      <FilterSelect
        id="inquiries-interest"
        label="Interest Type"
        allLabel="Any interest"
        value={filters.interestType}
        options={INTEREST_TYPES.map((key) => ({
          value: key,
          label: INTEREST_TYPE_LABELS[key],
        }))}
        onChange={(interestType) => {
          onChange({ interestType });
        }}
      />
      <FilterSelect
        id="inquiries-source"
        label="Lead Source"
        allLabel="Any source"
        value={filters.leadSourceId}
        options={pick(options.leadSources)}
        onChange={(leadSourceId) => {
          onChange({ leadSourceId });
        }}
      />
      <FilterSelect
        id="inquiries-assignee"
        label="Assignee"
        allLabel="Anyone"
        value={filters.assigneeMemberId}
        options={pick(options.members)}
        onChange={(assigneeMemberId) => {
          onChange({ assigneeMemberId });
        }}
      />
      <div className="col-span-2 min-w-0 space-y-1 sm:col-span-1">
        <Label htmlFor="inquiries-search" className="text-xs">
          Search
        </Label>
        <Input
          id="inquiries-search"
          type="search"
          placeholder="Name, mobile or email"
          className="h-8 w-full sm:w-56"
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

function InquiryRows({
  projectId,
  filters,
  cursor,
  today,
  canCreate,
  newHref,
  onPage,
}: {
  projectId: string;
  filters: Filters;
  cursor: InquiryFilters["cursor"];
  today: string;
  canCreate: boolean;
  newHref: string;
  onPage: (cursor: InquiryFilters["cursor"]) => void;
}) {
  const { data } = useSuspenseQuery(
    inquiriesQuery(projectId, { ...toQuery(filters), cursor }),
  );
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const href = (inquiry: Inquiry) => inquiriesPath(projectId, inquiry.id);
  const person = (value: { name: string | null } | null) =>
    value == null ? "—" : (value.name ?? "A former member");

  if (data.items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Users />
          </EmptyMedia>
          <EmptyTitle>
            {filtered ? "No inquiries match" : "No inquiries yet"}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try another status, stage or follow-up."
              : "Add every walk-in, call and referral here, then follow each one up until it is booked or lost."}
          </EmptyDescription>
        </EmptyHeader>
        {!filtered && canCreate && (
          <EmptyContent>
            <Link href={newHref} className={buttonVariants({ size: "sm" })}>
              Add Inquiry
            </Link>
          </EmptyContent>
        )}
      </Empty>
    );

  return (
    <div className="min-w-0 space-y-3">
      <p className="text-muted-foreground text-sm">{inquiries(data.total)}</p>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table aria-label="Inquiries">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Interest</TableHead>
              <TableHead>Funnel Stage</TableHead>
              <TableHead>Next follow-up</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((inquiry) => (
              <TableRow key={inquiry.id}>
                <TableCell className="max-w-64">
                  <Link
                    href={href(inquiry)}
                    className="block truncate font-medium hover:underline"
                  >
                    {inquiry.name}
                  </Link>
                  <div className="text-muted-foreground truncate text-xs">
                    {inquiry.mobile == null
                      ? (inquiry.email ?? "—")
                      : formatMobile(inquiry.mobile)}
                  </div>
                </TableCell>
                <TableCell>
                  {inquiry.interestType == null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <InterestChip interest={inquiry.interestType} />
                  )}
                </TableCell>
                <TableCell>{inquiry.funnelStage?.name ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <NextFollowUp
                    next={inquiry.nextFollowUp}
                    due={inquiry.due}
                    today={today}
                  />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {person(inquiry.assignee)}
                </TableCell>
                <TableCell>
                  <InquiryStatusBadge status={inquiry.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul aria-label="Inquiries" className="space-y-2 md:hidden">
        {data.items.map((inquiry) => (
          <li
            key={inquiry.id}
            className="min-w-0 space-y-1 rounded-lg border p-3"
          >
            <div className="flex min-w-0 items-center justify-between gap-2">
              <Link
                href={href(inquiry)}
                className="min-w-0 truncate font-medium hover:underline"
              >
                {inquiry.name}
              </Link>
              <InquiryStatusBadge status={inquiry.status} />
            </div>
            <div className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-2 text-xs">
              {inquiry.interestType != null && (
                <InterestChip interest={inquiry.interestType} />
              )}
              {inquiry.funnelStage != null && (
                <span>{inquiry.funnelStage.name}</span>
              )}
              {inquiry.mobile != null && (
                <span>· {formatMobile(inquiry.mobile)}</span>
              )}
            </div>
            {inquiry.due != null && (
              <p className="text-xs">
                <NextFollowUp
                  next={inquiry.nextFollowUp}
                  due={inquiry.due}
                  today={today}
                />
                {inquiry.assignee != null && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {person(inquiry.assignee)}
                  </span>
                )}
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
