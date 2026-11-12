"use client";

import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { MapPinned } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { cn } from "@repo/ui/lib/utils";

import { PageHeader } from "@/app/app/_components/app-shell/page-header";
import { FilterSelect } from "@/app/app/projects/[id]/_components/procurement/purchase-requests/filter-select";
import { marketingSection } from "@/lib/marketing-nav";
import {
  INTEREST_LABELS,
  INTERESTS,
  VISIT_PURPOSE_LABELS,
  VISIT_PURPOSES,
  VISIT_SHOWN_STATUSES,
  VISIT_STATUS_LABELS,
  type Interest,
  type VisitPurpose,
  type VisitShownStatus,
} from "@/src/marketing/domain/marketing-terms";
import { companyPath } from "@/src/queries/marketing-companies";
import {
  visitFormOptionsQuery,
  visitPath,
  visitsQuery,
  type VisitListItem,
} from "@/src/queries/marketing-visits";

import { VisitButtons } from "../../_components/visit-buttons";
import { ProspectCompanyPicker } from "./prospect-company-picker";
import { InterestBadge, VisitStatusBadge, visitWhen } from "./visit-parts";
import { VISIT_COLUMNS, VisitRowsSkeleton } from "./visits-skeletons";

type Filters = {
  from: string;
  to: string;
  memberId: string;
  prospectCompanyId: string;
  statuses: VisitShownStatus[];
  purposes: VisitPurpose[];
  interests: Interest[];
};

const NO_FILTERS: Filters = {
  from: "",
  to: "",
  memberId: "",
  prospectCompanyId: "",
  statuses: [],
  purposes: [],
  interests: [],
};

function visits(n: number): string {
  return `${String(n)} ${n === 1 ? "Visit" : "Visits"}`;
}

/**
 * Visits newest first, filtered by date range, Marketing Person, Prospect
 * Company, status (Missed included), purpose and interest. Without View
 * all the server lists only the viewer's own (ADR CM-0040 §5). The person
 * and company filters need the form options, which only a Role that adds
 * or edits Visits reads.
 */
export function VisitsList({ canCreate }: { canCreate: boolean }) {
  const section = marketingSection("visits");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [updating, startTransition] = useTransition();
  const change = (next: Partial<Filters>) => {
    startTransition(() => {
      setFilters((current) => ({ ...current, ...next }));
    });
  };
  return (
    <div className="w-full p-6">
      <div className="flex w-full max-w-7xl min-w-0 flex-col gap-6">
        <PageHeader
          title={section.title}
          meta={section.description}
          actions={canCreate ? <VisitButtons /> : undefined}
        />
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <DateFilter
            id="visits-from"
            label="From"
            value={filters.from}
            onChange={(from) => {
              change({ from });
            }}
          />
          <DateFilter
            id="visits-to"
            label="To"
            value={filters.to}
            onChange={(to) => {
              change({ to });
            }}
          />
          <PeopleAndCompanyFilters filters={filters} onChange={change} />
          <MultiFilter
            id="visits-status"
            label="Status"
            anyLabel="Any status"
            many="statuses"
            all={VISIT_SHOWN_STATUSES}
            labels={VISIT_STATUS_LABELS}
            value={filters.statuses}
            onChange={(statuses) => {
              change({ statuses });
            }}
          />
          <MultiFilter
            id="visits-purpose"
            label="Purpose"
            anyLabel="Any purpose"
            many="purposes"
            all={VISIT_PURPOSES}
            labels={VISIT_PURPOSE_LABELS}
            value={filters.purposes}
            onChange={(purposes) => {
              change({ purposes });
            }}
          />
          <MultiFilter
            id="visits-interest"
            label="Interest"
            anyLabel="Any interest"
            many="interests"
            all={INTERESTS}
            labels={INTEREST_LABELS}
            value={filters.interests}
            onChange={(interests) => {
              change({ interests });
            }}
          />
        </div>
        <div
          className={cn("min-w-0", updating && "opacity-60 transition-opacity")}
        >
          <Suspense fallback={<VisitRowsSkeleton />}>
            <VisitRows filters={filters} canCreate={canCreate} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function DateFilter({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="date"
        className="w-full sm:w-40"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </div>
  );
}

function PeopleAndCompanyFilters({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Partial<Filters>) => void;
}) {
  const { data: options } = useSuspenseQuery(visitFormOptionsQuery);
  return (
    <>
      <FilterSelect
        id="visits-member"
        label="Marketing Person"
        allLabel="Anyone"
        value={filters.memberId}
        options={options.people.map((person) => ({
          value: person.id,
          label: person.name,
        }))}
        onChange={(memberId) => {
          onChange({ memberId });
        }}
      />
      <div className="col-span-2 min-w-0 space-y-1 sm:col-span-1">
        <Label htmlFor="visits-company" className="text-xs">
          Prospect Company
        </Label>
        <ProspectCompanyPicker
          id="visits-company"
          companies={options.companies}
          value={filters.prospectCompanyId}
          placeholder="Any company"
          className="w-full min-w-0 sm:w-56"
          onChange={(prospectCompanyId) => {
            onChange({ prospectCompanyId });
          }}
        />
      </div>
    </>
  );
}

/** A Select of several values; none picked means any. */
function MultiFilter<T extends string>({
  id,
  label,
  anyLabel,
  many,
  all,
  labels,
  value,
  onChange,
}: {
  id: string;
  label: string;
  anyLabel: string;
  /** "statuses": the trigger says "2 statuses". */
  many: string;
  all: readonly T[];
  labels: Record<T, string>;
  value: T[];
  onChange: (value: T[]) => void;
}) {
  const items = all.map((key) => ({ value: key, label: labels[key] }));
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Select<T, true>
        multiple
        items={items}
        value={value}
        onValueChange={(next) => {
          onChange(all.filter((key) => next.includes(key)));
        }}
      >
        <SelectTrigger id={id} className="w-full min-w-0 sm:w-40">
          <SelectValue>
            {(picked: readonly T[]) => {
              const [first] = picked;
              if (first == null) return anyLabel;
              return picked.length === 1
                ? labels[first]
                : `${String(picked.length)} ${many}`;
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CompanyName({ visit }: { visit: VisitListItem }) {
  const { prospectCompany: company } = visit;
  return company.canOpen ? (
    <Link
      href={companyPath(company.id)}
      className="block truncate hover:underline"
    >
      {company.name}
    </Link>
  ) : (
    <span className="block truncate">{company.name}</span>
  );
}

const names = (list: readonly string[]) =>
  list.length === 0 ? "—" : list.join(", ");

function VisitRows({
  filters,
  canCreate,
}: {
  filters: Filters;
  canCreate: boolean;
}) {
  const query = useSuspenseInfiniteQuery(visitsQuery(filters));
  const pages = query.data.pages;
  const items = pages.flatMap((page) => page.items);
  const total = pages[0]?.total ?? 0;
  const timeZone = pages[0]?.timeZone ?? "Asia/Kolkata";
  const filtered = Object.values(filters).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== "",
  );

  if (items.length === 0)
    return (
      <Empty className="bg-card border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MapPinned />
          </EmptyMedia>
          <EmptyTitle>
            {filtered ? "No Visits match" : "No Visits yet"}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try other dates, people, companies or statuses."
              : "Plan the Visits your marketing team will make to Prospect Companies, or log one already made, with the people met and what was discussed."}
          </EmptyDescription>
        </EmptyHeader>
        {!filtered && canCreate && (
          <EmptyContent>
            <VisitButtons />
          </EmptyContent>
        )}
      </Empty>
    );

  return (
    <div className="min-w-0 space-y-3">
      <p className="text-muted-foreground text-sm">
        {items.length < total
          ? `Showing ${String(items.length)} of ${visits(total)}`
          : visits(total)}
      </p>
      <div className="bg-card hidden overflow-x-auto rounded-lg border md:block">
        <Table aria-label="Visits">
          <TableHeader>
            <TableRow>
              {VISIT_COLUMNS.map((column, index) => (
                <TableHead key={index} className={column.className}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((visit) => (
              <TableRow
                key={visit.id}
                className={cn(
                  visit.status === "missed" &&
                    "bg-red-50/60 dark:bg-red-950/30",
                )}
              >
                <TableCell>
                  <Link
                    href={visitPath(visit.id)}
                    className="font-medium whitespace-nowrap hover:underline"
                  >
                    {visit.number}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {visitWhen(visit.visitAt, timeZone)}
                </TableCell>
                <TableCell className="max-w-64">
                  <CompanyName visit={visit} />
                </TableCell>
                <TableCell className="text-muted-foreground max-w-48">
                  {names(visit.visitors.map((person) => person.name))}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-48">
                  {names(visit.contactNames)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {visit.purpose == null
                    ? "—"
                    : VISIT_PURPOSE_LABELS[visit.purpose]}
                </TableCell>
                <TableCell>
                  <VisitStatusBadge status={visit.status} />
                </TableCell>
                <TableCell>
                  <InterestBadge interest={visit.interest} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul aria-label="Visits" className="space-y-2 md:hidden">
        {items.map((visit) => (
          <li
            key={visit.id}
            className={cn(
              "bg-card min-w-0 space-y-1 rounded-lg border p-3",
              visit.status === "missed" && "border-red-300 dark:border-red-800",
            )}
          >
            <div className="flex min-w-0 items-center justify-between gap-2">
              <Link
                href={visitPath(visit.id)}
                className="font-medium hover:underline"
              >
                {visit.number}
              </Link>
              <VisitStatusBadge status={visit.status} />
            </div>
            <div className="min-w-0 text-sm">
              <CompanyName visit={visit} />
            </div>
            <p className="text-muted-foreground truncate text-xs">
              {[
                visitWhen(visit.visitAt, timeZone),
                visit.purpose == null
                  ? null
                  : VISIT_PURPOSE_LABELS[visit.purpose],
              ]
                .filter((part): part is string => part != null)
                .join(" · ")}
            </p>
            <p className="text-muted-foreground truncate text-xs">
              {`By ${names(visit.visitors.map((person) => person.name))}`}
              {visit.contactNames.length > 0 &&
                ` · Met ${visit.contactNames.join(", ")}`}
            </p>
            {visit.interest != null && (
              <InterestBadge interest={visit.interest} />
            )}
          </li>
        ))}
      </ul>
      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={query.isFetchingNextPage}
            onClick={() => {
              void query.fetchNextPage();
            }}
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
