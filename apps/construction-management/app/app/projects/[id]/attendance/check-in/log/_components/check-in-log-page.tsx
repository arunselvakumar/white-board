"use client";

import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ListX, Search } from "lucide-react";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { Suspense, useDeferredValue, useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { FilterTabs } from "@repo/ui/components/filter-tabs";
import { Input } from "@repo/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/ui/components/input-group";
import { Label } from "@repo/ui/components/label";
import { cn } from "@repo/ui/lib/utils";

import { parseAsCalendarDate } from "@/app/app/_components/activity/activity-search-params";
import {
  CheckInPhotoButton,
  CheckInPhotoDialog,
  checkInLocation,
  OpenInMaps,
} from "@/app/app/_components/check-in/check-in-entry-parts";
import { PageHeader } from "@/app/app/_components/app-shell/page-header";
import {
  CHECK_IN_NAME_SEARCH_MAX,
  checkInLogQuery,
  type CheckInEntry,
  type CheckInLogFilter,
} from "@/src/queries/check-ins";

import {
  ACTION_LABELS,
  checkInBasePath,
  formatCalendarDate,
  formatTime,
  kindFromSegment,
} from "@/app/app/projects/[id]/attendance/check-in/_components/check-in-format";

import { CheckInLogSkeleton } from "./check-in-log-skeletons";
import { VoidEntryDialog } from "./void-entry-dialog";

const LOG_KINDS = ["all", "site-engineer", "labour", "vendor"] as const;
type LogKind = (typeof LOG_KINDS)[number];

const KIND_TABS: { value: LogKind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "site-engineer", label: "Site Engineers" },
  { value: "labour", label: "Labours" },
  { value: "vendor", label: "Vendors" },
];

/** The log's filters in the address: the day, the kind of person, a name. */
export const CHECK_IN_LOG_SEARCH = {
  date: parseAsCalendarDate,
  kind: parseAsStringLiteral(LOG_KINDS).withDefault("all"),
  q: parseAsString.withDefault(""),
};

type Search = {
  date: string | null;
  kind: LogKind;
  q: string;
};

/** Today on this device, `YYYY-MM-DD`, until the server's is known. */
function deviceToday(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function shiftDate(date: string, days: number): string {
  const time = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(time).toISOString().slice(0, 10);
}

function entryName(entry: CheckInEntry, timeZone: string): string {
  return `${entry.personName}, ${ACTION_LABELS[entry.action]} ${formatTime(entry.at, timeZone)}`;
}

function ActionBadge({ entry }: { entry: CheckInEntry }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-0",
        entry.action === "check_in"
          ? "bg-emerald-600/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400"
          : "bg-muted text-muted-foreground",
      )}
    >
      {ACTION_LABELS[entry.action]}
    </Badge>
  );
}

function EntryRow({
  entry,
  timeZone,
  canVoid,
  onOpenPhoto,
  onVoid,
}: {
  entry: CheckInEntry;
  timeZone: string;
  canVoid: boolean;
  onOpenPhoto: () => void;
  onVoid: () => void;
}) {
  const voided = entry.voided;
  const name = entryName(entry, timeZone);
  return (
    <li
      aria-label={name}
      className="bg-card flex items-start gap-3 rounded-xl border p-3 sm:items-center"
    >
      <CheckInPhotoButton
        entryId={entry.id}
        hasPhoto={entry.hasPhoto}
        label={name}
        onOpen={onOpenPhoto}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p
          className={cn(
            "flex flex-wrap items-center gap-x-2 gap-y-1",
            voided != null && "text-muted-foreground",
          )}
        >
          <span
            className={cn("font-semibold", voided != null && "line-through")}
          >
            {entry.personName}
          </span>
          {entry.role == null ? null : (
            <span className="text-muted-foreground text-sm">{entry.role}</span>
          )}
        </p>
        <p
          className={cn(
            "flex flex-wrap items-center gap-2 text-sm",
            voided != null && "line-through opacity-70",
          )}
        >
          <ActionBadge entry={entry} />
          <span className="font-medium tabular-nums">
            {formatTime(entry.at, timeZone)}
          </span>
          <span className="text-muted-foreground">
            {checkInLocation(entry)}
          </span>
          {entry.location == null ? null : (
            <OpenInMaps location={entry.location} />
          )}
        </p>
        <p className="text-muted-foreground text-xs">
          Recorded by {entry.recordedBy.name}
        </p>
        {voided == null ? null : (
          <p className="text-destructive text-sm">
            Voided by {voided.by.name}: {voided.reason}
          </p>
        )}
      </div>
      {canVoid && voided == null ? (
        <Button
          type="button"
          variant="outline"
          className="h-12 shrink-0 px-4"
          aria-label={`Void ${name}`}
          onClick={onVoid}
        >
          Void
        </Button>
      ) : null}
    </li>
  );
}

function Filters({
  search,
  today,
  onChange,
}: {
  search: Search;
  today: string;
  onChange: (patch: Partial<Search>) => void;
}) {
  const date = search.date ?? today;
  const setDate = (next: string) => {
    onChange({ date: next >= today ? null : next });
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="check-in-log-date">Date</Label>
          <Input
            id="check-in-log-date"
            type="date"
            className="h-12 w-44"
            value={date}
            max={today}
            onChange={(event) => {
              if (event.target.value.length > 0) setDate(event.target.value);
            }}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label="Previous day"
          onClick={() => {
            setDate(shiftDate(date, -1));
          }}
        >
          <ChevronLeft />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label="Next day"
          disabled={date >= today}
          onClick={() => {
            setDate(shiftDate(date, 1));
          }}
        >
          <ChevronRight />
        </Button>
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <FilterTabs
          aria-label="Who"
          items={KIND_TABS}
          value={search.kind}
          onValueChange={(kind) => {
            onChange({ kind });
          }}
          className="max-w-full overflow-x-auto"
        />
        <InputGroup className="h-12 md:max-w-xs">
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Search by name"
            placeholder="Search by name"
            autoComplete="off"
            maxLength={CHECK_IN_NAME_SEARCH_MAX}
            className="h-full text-base [&::-webkit-search-cancel-button]:appearance-none"
            value={search.q}
            onChange={(event) => {
              onChange({ q: event.target.value });
            }}
          />
        </InputGroup>
      </div>
    </div>
  );
}

function filterOf(projectId: string, search: Search): CheckInLogFilter {
  return {
    projectId,
    date: search.date,
    kind: search.kind === "all" ? null : kindFromSegment(search.kind),
    q: search.q.slice(0, CHECK_IN_NAME_SEARCH_MAX),
  };
}

function LogBody({
  projectId,
  search,
  shown,
  onChange,
}: {
  projectId: string;
  /** What the filters say now. */
  search: Search;
  /** What the list shows, a step behind while the next one loads. */
  shown: Search;
  onChange: (patch: Partial<Search>) => void;
}) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSuspenseInfiniteQuery(checkInLogQuery(filterOf(projectId, shown)));
  const [first] = data.pages;
  const items = data.pages.flatMap((page) => page.items);
  const timeZone = first?.timeZone ?? "Asia/Kolkata";
  const canVoid = first?.canVoid ?? false;
  const canVoidLabour = first?.canVoidLabour ?? false;
  const today = first?.today ?? deviceToday();
  const total = first?.total ?? 0;
  const [photo, setPhoto] = useState<CheckInEntry | null>(null);
  const [voiding, setVoiding] = useState<CheckInEntry | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const filtered = shown.kind !== "all" || shown.q.trim() !== "";
  const stale =
    search.date !== shown.date ||
    search.kind !== shown.kind ||
    search.q !== shown.q;

  return (
    <div className="space-y-4">
      <Filters
        search={search}
        today={today}
        onChange={(patch) => {
          setMessage(null);
          onChange(patch);
        }}
      />
      <div
        className={cn("space-y-3", stale && "opacity-60 transition-opacity")}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">
            {formatCalendarDate(first?.date ?? today)}
          </h2>
          <p className="text-muted-foreground text-sm tabular-nums">
            {total === 1 ? "1 entry" : `${String(total)} entries`}
          </p>
        </div>
        {message == null ? null : (
          <p
            role="status"
            className="text-sm font-medium text-emerald-700 dark:text-emerald-400"
          >
            {message}
          </p>
        )}
        {items.length === 0 ? (
          <Empty className="bg-card border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ListX />
              </EmptyMedia>
              <EmptyTitle>No entries</EmptyTitle>
              <EmptyDescription>
                {filtered
                  ? "Nobody matches these filters on this day."
                  : "Nobody was checked in or out on this day."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul aria-label="Check-In log" className="space-y-2">
            {items.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                timeZone={timeZone}
                canVoid={entry.kind === "labour" ? canVoidLabour : canVoid}
                onOpenPhoto={() => {
                  setPhoto(entry);
                }}
                onVoid={() => {
                  setMessage(null);
                  setVoiding(entry);
                }}
              />
            ))}
          </ul>
        )}
        {hasNextPage ? (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={isFetchingNextPage}
              onClick={() => {
                void fetchNextPage();
              }}
            >
              {isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          </div>
        ) : null}
      </div>
      <CheckInPhotoDialog
        entryId={photo?.id ?? null}
        title={photo == null ? null : entryName(photo, timeZone)}
        description={
          photo == null
            ? null
            : `${checkInLocation(photo)} · Recorded by ${photo.recordedBy.name}`
        }
        onClose={() => {
          setPhoto(null);
        }}
      />
      <VoidEntryDialog
        projectId={projectId}
        entry={voiding}
        timeZone={timeZone}
        onClose={() => {
          setVoiding(null);
        }}
        onVoided={(entry) => {
          setVoiding(null);
          setMessage(`Voided ${entryName(entry, timeZone)}.`);
        }}
      />
    </div>
  );
}

/**
 * The Check-In log (ADR CM-0043 §7): a day's entries, newest first, with
 * the photo, the location and who recorded each; Void strikes one out with
 * a reason. The day, the kind of person and the name are in the address.
 */
export function CheckInLogPage({ projectId }: { projectId: string }) {
  const [search, setSearch] = useQueryStates(CHECK_IN_LOG_SEARCH);
  // The list keeps the last answer on screen while the next one loads.
  const shown = useDeferredValue(search);
  return (
    <div className="w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <PageHeader
        back={{ label: "Check-In", href: checkInBasePath(projectId) }}
        title="Check-In log"
      />
      <Suspense fallback={<CheckInLogSkeleton />}>
        <LogBody
          projectId={projectId}
          search={search}
          shown={shown}
          onChange={(patch) => {
            void setSearch(patch);
          }}
        />
      </Suspense>
    </div>
  );
}
