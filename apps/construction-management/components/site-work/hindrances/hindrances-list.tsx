"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { OctagonPause, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense, useDeferredValue, useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
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
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { cn } from "@repo/ui/lib/utils";

import {
  HINDRANCE_CAUSE_LABELS,
  HINDRANCE_CAUSES,
  RESPONSIBLE_PARTIES,
  RESPONSIBLE_PARTY_LABELS,
  type HindranceCause,
  type ResponsibleParty,
} from "@/src/site-work/domain/hindrance";
import {
  hindranceFormOptionsQuery,
  hindrancesPath,
  hindrancesQuery,
  type Hindrance,
  type HindranceFilters,
} from "@/src/queries/hindrances";
import {
  canInSiteWork,
  siteWorkAccessQuery,
} from "@/src/queries/site-work-access";

import {
  hindrancePeriod,
  HindranceStatusBadge,
  lostSummary,
  partyLabel,
} from "./hindrance-parts";
import {
  HINDRANCE_STATUS_TABS,
  HindranceRowsSkeleton,
} from "@/components/site-work/site-work-skeletons";

const ALL = "all";

function HindranceItem({
  hindrance,
  href,
}: {
  hindrance: Hindrance;
  href: string;
}) {
  return (
    <li className="bg-card hover:bg-muted/40 relative rounded-lg border p-3 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <Link
            href={href}
            className="focus-visible:ring-ring block rounded-sm font-medium outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:ring-2"
          >
            {hindrance.number}
          </Link>
          <p className="truncate text-sm">{hindrance.affectedActivity}</p>
        </div>
        <HindranceStatusBadge status={hindrance.status} />
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        {HINDRANCE_CAUSE_LABELS[hindrance.cause]} · {partyLabel(hindrance)}
      </p>
      <p className="text-muted-foreground mt-0.5 text-xs">
        {hindrancePeriod(hindrance)} · {lostSummary(hindrance)}
      </p>
    </li>
  );
}

function Hindrances({
  projectId,
  filters,
  newHref,
  onPage,
  className,
}: {
  projectId: string;
  filters: HindranceFilters;
  newHref: string | null;
  onPage: (cursor: HindranceFilters["cursor"]) => void;
  className?: string;
}) {
  const { data } = useSuspenseQuery(hindrancesQuery(projectId, filters));
  const filtered =
    filters.status != null ||
    filters.cause != null ||
    filters.responsibleParty != null ||
    filters.contractorId != null ||
    (filters.from ?? "") !== "" ||
    (filters.to ?? "") !== "" ||
    (filters.search ?? "").trim() !== "";
  if (data.items.length === 0)
    return (
      <Empty className="bg-card border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <OctagonPause />
          </EmptyMedia>
          <EmptyTitle>
            {filtered ? "No hindrances match" : "No hindrances recorded"}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try another status, cause, party or date range."
              : "Record each stoppage on site: its cause, the activity it held up and who was responsible."}
          </EmptyDescription>
        </EmptyHeader>
        {!filtered && newHref != null && (
          <EmptyContent>
            <Link href={newHref} className={buttonVariants()}>
              <Plus aria-hidden="true" />
              Record hindrance
            </Link>
          </EmptyContent>
        )}
      </Empty>
    );
  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-muted-foreground text-sm">
        {data.total} {data.total === 1 ? "hindrance" : "hindrances"}
      </p>
      <ul aria-label="Hindrances" className="grid gap-2 lg:grid-cols-2">
        {data.items.map((hindrance) => (
          <HindranceItem
            key={hindrance.id}
            hindrance={hindrance}
            href={hindrancesPath(projectId, hindrance.id)}
          />
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

function FilterSelect<Value extends string>({
  label,
  anyLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  anyLabel: string;
  value: Value | null | undefined;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value | null) => void;
}) {
  const items = [{ value: ALL, label: anyLabel }, ...options];
  return (
    <Select
      items={items}
      value={value ?? ALL}
      onValueChange={(next) => {
        if (next == null) return;
        onChange(next === ALL ? null : (next as Value));
      }}
    >
      <SelectTrigger aria-label={label} className="w-full sm:w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The Project's Hindrance register (CM-607, ADR CM-0016 §14), newest first:
 * each with its period, days and hours lost, cause and responsible party.
 * Filters by open / closed, cause, party, Contractor, a date range it
 * overlaps, and the number or activity.
 */
export function HindrancesList({ projectId }: { projectId: string }) {
  const { data: access } = useSuspenseQuery(siteWorkAccessQuery(projectId));
  const { data: options } = useSuspenseQuery(
    hindranceFormOptionsQuery(projectId),
  );
  const [filters, setFilters] = useState<HindranceFilters>({});
  // Filter, search and page changes keep the old rows on screen, dimmed,
  // while the next ones load (ADR-0047).
  const shown = useDeferredValue(filters);
  const change = (next: Partial<HindranceFilters>) => {
    setFilters((current) => ({ ...current, ...next, cursor: null }));
  };
  const canCreate = canInSiteWork(access, "site_work.hindrances", "create");
  const newHref = `${hindrancesPath(projectId)}/new`;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Hindrances</h2>
        {canCreate && (
          <Link href={newHref} className={buttonVariants({ size: "sm" })}>
            <Plus aria-hidden="true" />
            Record hindrance
          </Link>
        )}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <FilterTabs
          aria-label="Status"
          items={HINDRANCE_STATUS_TABS}
          value={filters.status ?? ALL}
          onValueChange={(next) => {
            change({ status: next === ALL ? null : next });
          }}
        />
        <FilterSelect<HindranceCause>
          label="Cause"
          anyLabel="Any cause"
          value={filters.cause}
          options={HINDRANCE_CAUSES.map((value) => ({
            value,
            label: HINDRANCE_CAUSE_LABELS[value],
          }))}
          onChange={(cause) => {
            change({ cause });
          }}
        />
        <FilterSelect<ResponsibleParty>
          label="Responsible party"
          anyLabel="Any party"
          value={filters.responsibleParty}
          options={RESPONSIBLE_PARTIES.map((value) => ({
            value,
            label: RESPONSIBLE_PARTY_LABELS[value],
          }))}
          onChange={(responsibleParty) => {
            change({ responsibleParty });
          }}
        />
        {options.contractors.length > 0 && (
          <FilterSelect<string>
            label="Contractor"
            anyLabel="Any Contractor"
            value={filters.contractorId}
            options={options.contractors.map((contractor) => ({
              value: contractor.id,
              label: contractor.name,
            }))}
            onChange={(contractorId) => {
              change({ contractorId });
            }}
          />
        )}
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="hindrances-from" className="text-xs">
              From
            </Label>
            <Input
              id="hindrances-from"
              type="date"
              className="w-36"
              value={filters.from ?? ""}
              onChange={(event) => {
                change({ from: event.target.value });
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hindrances-to" className="text-xs">
              To
            </Label>
            <Input
              id="hindrances-to"
              type="date"
              className="w-36"
              value={filters.to ?? ""}
              onChange={(event) => {
                change({ to: event.target.value });
              }}
            />
          </div>
        </div>
        <Input
          type="search"
          aria-label="Search by number or activity"
          placeholder="Number or activity"
          className="w-full sm:w-52"
          value={filters.search ?? ""}
          onChange={(event) => {
            change({ search: event.target.value });
          }}
        />
      </div>
      <Suspense fallback={<HindranceRowsSkeleton />}>
        <Hindrances
          projectId={projectId}
          filters={shown}
          className={cn(shown !== filters && "opacity-60 transition-opacity")}
          newHref={canCreate ? newHref : null}
          onPage={(cursor) => {
            setFilters((current) => ({ ...current, cursor }));
          }}
        />
      </Suspense>
    </div>
  );
}
