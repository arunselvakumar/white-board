"use client";

import { formatMobile } from "@repo/auth/construction/react";
import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Building, Plus } from "lucide-react";
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
import { FormAlert } from "@/components/auth/form-alert";
import { marketingSection } from "@/lib/marketing-nav";
import {
  STAGE_LABELS,
  STAGES,
  type Stage,
} from "@/src/marketing/domain/marketing-terms";
import {
  companiesQuery,
  companyFormOptionsQuery,
  companyPath,
  type CompanyFilters,
  type ProspectCompanyListItem,
} from "@/src/queries/marketing-companies";

import { COMPANY_COLUMNS, CompanyRowsSkeleton } from "./companies-skeletons";
import { StageBadge } from "./company-parts";

type Filters = {
  search: string;
  stages: Stage[];
  assignedMemberId: string;
  industry: string;
};

const NO_FILTERS: Filters = {
  search: "",
  stages: [],
  assignedMemberId: "",
  industry: "",
};

const STAGE_ITEMS = STAGES.map((stage) => ({
  value: stage,
  label: STAGE_LABELS[stage],
}));

function companies(n: number): string {
  return `${String(n)} ${n === 1 ? "Prospect Company" : "Prospect Companies"}`;
}

const NEW_HREF = `${companyPath()}/new`;

function AddButton() {
  return (
    <Link href={NEW_HREF} className={buttonVariants()}>
      <Plus aria-hidden="true" />
      Add Prospect Company
    </Link>
  );
}

/**
 * Prospect Companies A–Z with search (name, city, a Contact's name or
 * mobile) and filters by Stage, assigned person and industry. Without View
 * all the server lists only the viewer's own (ADR CM-0040 §5).
 */
export function CompaniesList({ canCreate }: { canCreate: boolean }) {
  const section = marketingSection("companies");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [updating, startTransition] = useTransition();
  const change = (next: Partial<Filters>) => {
    startTransition(() => {
      setFilters((current) => ({ ...current, ...next }));
    });
  };
  return (
    <div className="w-full p-6">
      <div className="flex w-full max-w-6xl min-w-0 flex-col gap-6">
        <PageHeader
          title={section.title}
          meta={section.description}
          actions={canCreate ? <AddButton /> : undefined}
        />
        <FilterBar filters={filters} onChange={change} />
        <div
          className={cn("min-w-0", updating && "opacity-60 transition-opacity")}
        >
          <Suspense fallback={<CompanyRowsSkeleton />}>
            <CompanyRows filters={filters} canCreate={canCreate} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function StageFilter({
  value,
  onChange,
}: {
  value: Stage[];
  onChange: (value: Stage[]) => void;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor="companies-stage" className="text-xs">
        Stage
      </Label>
      <Select<Stage, true>
        multiple
        items={STAGE_ITEMS}
        value={value}
        onValueChange={(next) => {
          onChange(STAGES.filter((stage) => next.includes(stage)));
        }}
      >
        <SelectTrigger id="companies-stage" className="w-full min-w-0 sm:w-44">
          <SelectValue>
            {(picked: readonly Stage[]) => {
              const [first] = picked;
              if (first == null) return "Any Stage";
              return picked.length === 1
                ? STAGE_LABELS[first]
                : `${String(picked.length)} Stages`;
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          {STAGE_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FilterBar({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Partial<Filters>) => void;
}) {
  // The box shows every keystroke at once; the list follows in a transition.
  const [search, setSearch] = useState(filters.search);
  const { data: options } = useSuspenseQuery(companyFormOptionsQuery);
  return (
    <div className="grid min-w-0 grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
      <div className="col-span-2 min-w-0 space-y-1 sm:col-span-1">
        <Label htmlFor="companies-search" className="text-xs">
          Search
        </Label>
        <Input
          id="companies-search"
          type="search"
          placeholder="Name, city, Contact or mobile"
          className="w-full sm:w-64"
          maxLength={100}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            onChange({ search: event.target.value });
          }}
        />
      </div>
      <div className="col-span-2 sm:col-span-1">
        <StageFilter
          value={filters.stages}
          onChange={(stages) => {
            onChange({ stages });
          }}
        />
      </div>
      <FilterSelect
        id="companies-assigned"
        label="Assigned to"
        allLabel="Anyone"
        value={filters.assignedMemberId}
        options={options.people.map((person) => ({
          value: person.id,
          label: person.active ? person.name : `${person.name} (inactive)`,
        }))}
        onChange={(assignedMemberId) => {
          onChange({ assignedMemberId });
        }}
      />
      <FilterSelect
        id="companies-industry"
        label="Industry"
        allLabel="Any industry"
        value={filters.industry}
        options={options.industries.map((industry) => ({
          value: industry,
          label: industry,
        }))}
        onChange={(industry) => {
          onChange({ industry });
        }}
      />
    </div>
  );
}

function toQuery(filters: Filters): CompanyFilters {
  return {
    search: filters.search,
    stages: filters.stages,
    assignedMemberId: filters.assignedMemberId,
    industry: filters.industry,
  };
}

function PrimaryContact({
  contact,
}: {
  contact: ProspectCompanyListItem["primaryContact"];
}) {
  if (contact == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="min-w-0">
      <span className="block truncate">{contact.name}</span>
      {contact.mobile != null && (
        <span className="text-muted-foreground block truncate text-xs">
          {formatMobile(contact.mobile)}
        </span>
      )}
    </span>
  );
}

function CompanyRows({
  filters,
  canCreate,
}: {
  filters: Filters;
  canCreate: boolean;
}) {
  const query = useSuspenseInfiniteQuery(companiesQuery(toQuery(filters)));
  const pages = query.data.pages;
  const items = pages.flatMap((page) => page.items);
  const total = pages[0]?.total ?? 0;
  const filtered =
    filters.search.trim() !== "" ||
    filters.stages.length > 0 ||
    filters.assignedMemberId !== "" ||
    filters.industry !== "";

  if (items.length === 0)
    return (
      <Empty className="bg-card border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Building />
          </EmptyMedia>
          <EmptyTitle>
            {filtered
              ? "No Prospect Companies match"
              : "No Prospect Companies yet"}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try another search, Stage, person or industry."
              : "Add the companies your marketing team visits, with their Contacts, and move each one through its Stages until it is won or lost."}
          </EmptyDescription>
        </EmptyHeader>
        {!filtered && canCreate && (
          <EmptyContent>
            <AddButton />
          </EmptyContent>
        )}
      </Empty>
    );

  return (
    <div className="min-w-0 space-y-3">
      <p className="text-muted-foreground text-sm">
        {items.length < total
          ? `Showing ${String(items.length)} of ${companies(total)}`
          : companies(total)}
      </p>
      <div className="bg-card hidden overflow-x-auto rounded-lg border md:block">
        <Table aria-label="Prospect Companies">
          <TableHeader>
            <TableRow>
              {COMPANY_COLUMNS.map((column, index) => (
                <TableHead key={index} className={column.className}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((company) => (
              <TableRow key={company.id}>
                <TableCell className="max-w-72">
                  <Link
                    href={companyPath(company.id)}
                    className="block truncate font-medium hover:underline"
                  >
                    {company.name}
                  </Link>
                  {company.industry != null && (
                    <span className="text-muted-foreground block truncate text-xs">
                      {company.industry}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {company.city ?? "—"}
                </TableCell>
                <TableCell>
                  <StageBadge stage={company.stage} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {company.assignedTo?.name ?? "—"}
                </TableCell>
                <TableCell className="max-w-56">
                  <PrimaryContact contact={company.primaryContact} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul aria-label="Prospect Companies" className="space-y-2 md:hidden">
        {items.map((company) => (
          <li
            key={company.id}
            className="bg-card min-w-0 space-y-1 rounded-lg border p-3"
          >
            <div className="flex min-w-0 items-center justify-between gap-2">
              <Link
                href={companyPath(company.id)}
                className="min-w-0 truncate font-medium hover:underline"
              >
                {company.name}
              </Link>
              <StageBadge stage={company.stage} />
            </div>
            <p className="text-muted-foreground truncate text-xs">
              {[company.city, company.assignedTo?.name]
                .filter((part): part is string => part != null)
                .join(" · ") || "—"}
            </p>
            {company.primaryContact != null && (
              <p className="truncate text-xs">
                {company.primaryContact.name}
                {company.primaryContact.mobile != null && (
                  <span className="text-muted-foreground">
                    {" · "}
                    {formatMobile(company.primaryContact.mobile)}
                  </span>
                )}
              </p>
            )}
          </li>
        ))}
      </ul>
      {query.hasNextPage && (
        <div className="flex flex-col items-center gap-2">
          {query.isFetchNextPageError && (
            <FormAlert message="Couldn't load more. Please try again." />
          )}
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
