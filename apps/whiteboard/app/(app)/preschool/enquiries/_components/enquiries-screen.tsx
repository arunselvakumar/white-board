"use client";

import {
  ChatsCircleIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react/ssr";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense, useDeferredValue, useState, useTransition } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";
import { FilterTabs } from "@repo/ui/components/filter-tabs";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
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
import { useActiveCentre } from "@/app/(app)/preschool/_components/active-centre-provider";
import { PhoneLinks } from "@/app/(app)/preschool/_components/phone-links";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import {
  PRESCHOOL_ENQUIRY_STATUS_LABELS,
  preschoolEnquiriesQueryOptions,
  preschoolEnquirySummaryQueryOptions,
  type PreschoolEnquiry,
  type PreschoolEnquiryListView,
  type PreschoolEnquiryStatus,
} from "@/src/queries/preschool/enquiries";

import {
  EnquiryActionDialog,
  useEnquiryMoves,
  type EnquiryAction,
} from "./enquiry-actions";
import { EnquiryCard, EnquiryMenu, FollowUpDate } from "./enquiry-card";

const BOARD_COLUMNS = [
  "new",
  "contacted",
  "visit_scheduled",
  "visited",
] as const satisfies readonly PreschoolEnquiryStatus[];

const SUMMARY_TILES = [
  "new",
  "contacted",
  "visit_scheduled",
  "visited",
  "admitted",
  "lost",
] as const satisfies readonly PreschoolEnquiryStatus[];

/** The board shows at most this many open Enquiries; the list pages the rest. */
const BOARD_LIMIT = 100;
const PAGE_SIZE = 25;

type Layout = "board" | "list";

function SummaryStrip({
  centreId,
  onShowDue,
}: {
  centreId: string;
  onShowDue: () => void;
}) {
  const { data } = useSuspenseQuery(
    preschoolEnquirySummaryQueryOptions(centreId),
  );
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {SUMMARY_TILES.map((status) => (
        <div key={status} className="bg-card rounded-xl border px-3 py-2">
          <dt className="text-muted-foreground text-xs">
            {PRESCHOOL_ENQUIRY_STATUS_LABELS[status]}
          </dt>
          <dd className="text-xl font-semibold tabular-nums">
            {data.byStatus[status]}
          </dd>
        </div>
      ))}
      <div
        className={cn(
          "rounded-xl border px-3 py-2",
          data.followUpsDue > 0
            ? "border-rose-300 bg-rose-50 dark:border-rose-400/40 dark:bg-rose-400/10"
            : "bg-card",
        )}
      >
        <dt className="text-muted-foreground text-xs">Follow-ups due</dt>
        <dd className="flex items-baseline justify-between gap-2">
          <span className="text-xl font-semibold tabular-nums">
            {data.followUpsDue}
          </span>
          {data.followUpsDue > 0 ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0"
              onClick={onShowDue}
            >
              Show
            </Button>
          ) : null}
        </dd>
      </div>
    </dl>
  );
}

type Handlers = {
  onAction: (action: EnquiryAction) => void;
  onMove: (enquiry: PreschoolEnquiry, status: "contacted" | "visited") => void;
};

function Board({
  centreId,
  onAction,
  onMove,
}: { centreId: string } & Handlers) {
  const { data } = useSuspenseQuery(
    preschoolEnquiriesQueryOptions({
      centreId,
      view: "open",
      limit: BOARD_LIMIT,
    }),
  );
  if (data.total === 0)
    return (
      <EmptyState
        className="border"
        icon={ChatsCircleIcon}
        tone="pink"
        title="No open Enquiries"
        description="Record each family that asks about admission, and follow them up here."
        actions={
          <Link href="/preschool/enquiries/new" className={buttonVariants()}>
            <Plus aria-hidden="true" />
            Add Enquiry
          </Link>
        }
      />
    );
  return (
    <div className="space-y-2">
      {data.total > data.items.length ? (
        <p className="text-muted-foreground text-sm">
          Showing the newest {data.items.length} of {data.total} open Enquiries.
          Use the list to see them all.
        </p>
      ) : null}
      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <div className="grid min-w-[60rem] grid-cols-4 gap-3">
          {BOARD_COLUMNS.map((status) => {
            const cards = data.items.filter((item) => item.status === status);
            const headingId = `board-${status}`;
            return (
              <section
                key={status}
                aria-labelledby={headingId}
                className="bg-muted/40 flex min-w-0 flex-col gap-2 rounded-xl p-2"
              >
                <h2
                  id={headingId}
                  className="flex items-center justify-between px-1 text-sm font-semibold"
                >
                  {PRESCHOOL_ENQUIRY_STATUS_LABELS[status]}
                  <Badge variant="secondary">{cards.length}</Badge>
                </h2>
                <ul className="flex flex-col gap-2">
                  {cards.map((enquiry) => (
                    <EnquiryCard
                      key={enquiry.id}
                      enquiry={enquiry}
                      onAction={onAction}
                      onMove={(next) => {
                        onMove(enquiry, next);
                      }}
                    />
                  ))}
                </ul>
                {cards.length === 0 ? (
                  <p className="text-muted-foreground px-1 py-4 text-center text-xs">
                    None
                  </p>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const VIEW_TABS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "due", label: "Due" },
  { value: "closed", label: "Closed" },
] as const satisfies readonly {
  value: PreschoolEnquiryListView;
  label: string;
}[];

const STATUS_OPTIONS = [
  { value: "any", label: "Any status" },
  ...(
    Object.entries(PRESCHOOL_ENQUIRY_STATUS_LABELS) as [
      PreschoolEnquiryStatus,
      string,
    ][]
  ).map(([value, label]) => ({ value, label })),
];

type ListFilters = {
  view: PreschoolEnquiryListView;
  status: PreschoolEnquiryStatus | "any";
  q: string;
  /** Cursors of the pages before this one; the last is this page's. */
  cursors: string[];
};

function EnquiryTable({
  centreId,
  filters,
  onPage,
  onAction,
  onMove,
}: {
  centreId: string;
  filters: ListFilters;
  onPage: (cursors: string[]) => void;
} & Handlers) {
  const { data } = useSuspenseQuery(
    preschoolEnquiriesQueryOptions({
      centreId,
      view: filters.view,
      status: filters.status === "any" ? undefined : filters.status,
      q: filters.q.trim() === "" ? undefined : filters.q.trim(),
      limit: PAGE_SIZE,
      cursor: filters.cursors.at(-1),
    }),
  );
  if (data.items.length === 0)
    return (
      <EmptyState
        size="sm"
        className="border"
        icon={MagnifyingGlassIcon}
        tone="neutral"
        title="No Enquiries match"
        description="Try another view, status or search."
      />
    );
  const first = filters.cursors.length * PAGE_SIZE + 1;
  return (
    <div className="space-y-3">
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Child</TableHead>
              <TableHead>Parent</TableHead>
              <TableHead>Programme</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Next follow-up</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((enquiry) => {
              const open = !["admitted", "lost"].includes(enquiry.status);
              return (
                <TableRow key={enquiry.id}>
                  <TableCell className="min-w-40">
                    <Link
                      href={`/preschool/enquiries/${enquiry.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {enquiry.childName}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      {enquiry.childAgeText ?? "Age not known"}
                    </p>
                  </TableCell>
                  <TableCell className="min-w-44">
                    <p>{enquiry.parentName}</p>
                    <PhoneLinks
                      phone={enquiry.parentPhone}
                      label={enquiry.parentName}
                    />
                  </TableCell>
                  <TableCell>{enquiry.programmeName ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        enquiry.status === "lost"
                          ? "destructive"
                          : enquiry.status === "admitted"
                            ? "default"
                            : "secondary"
                      }
                    >
                      {PRESCHOOL_ENQUIRY_STATUS_LABELS[enquiry.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="min-w-40 text-xs">
                    {open ? <FollowUpDate enquiry={enquiry} /> : "—"}
                  </TableCell>
                  <TableCell>
                    {open ? (
                      <EnquiryMenu
                        enquiry={enquiry}
                        onAction={onAction}
                        onMove={(next) => {
                          onMove(enquiry, next);
                        }}
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground tabular-nums">
          {first}–{first + data.items.length - 1} of {data.total}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={filters.cursors.length === 0}
            onClick={() => {
              onPage(filters.cursors.slice(0, -1));
            }}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={data.nextCursor == null}
            onClick={() => {
              if (data.nextCursor != null)
                onPage([...filters.cursors, data.nextCursor]);
            }}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function SectionSkeleton() {
  return <Skeleton className="h-64 w-full rounded-xl" />;
}

/** The Centre's Enquiries: a summary, the pipeline board and the list. */
export function EnquiriesScreen() {
  const { centre } = useActiveCentre();
  const [layout, setLayout] = useState<Layout>("board");
  const [filters, setFilters] = useState<ListFilters>({
    view: "open",
    status: "any",
    q: "",
    cursors: [],
  });
  const [action, setAction] = useState<EnquiryAction | null>(null);
  const [, startTransition] = useTransition();
  const moves = useEnquiryMoves();
  const shownFilters = useDeferredValue(filters);
  const change = (next: Partial<ListFilters>) => {
    setFilters((current) => ({ ...current, cursors: [], ...next }));
  };
  const handlers: Handlers = {
    onAction: setAction,
    onMove: (enquiry, status) => {
      moves.move.mutate({ id: enquiry.id, status });
    },
  };

  return (
    <PreschoolPage
      title="Enquiries"
      watermark="Enquiries"
      actions={
        <Link href="/preschool/enquiries/new" className={buttonVariants()}>
          <Plus aria-hidden="true" />
          Add Enquiry
        </Link>
      }
    >
      <Suspense fallback={<Skeleton className="h-16 w-full rounded-xl" />}>
        <SummaryStrip
          centreId={centre.id}
          onShowDue={() => {
            setLayout("list");
            change({ view: "due", status: "any" });
          }}
        />
      </Suspense>
      <FormAlert message={moves.error} />
      <FilterTabs
        aria-label="Show Enquiries as"
        value={layout}
        onValueChange={(next) => {
          startTransition(() => {
            setLayout(next);
          });
        }}
        items={[
          { value: "board", label: "Board" },
          { value: "list", label: "List" },
        ]}
      />
      {layout === "board" ? (
        <Suspense fallback={<SectionSkeleton />}>
          <Board centreId={centre.id} {...handlers} />
        </Suspense>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              type="search"
              aria-label="Search Enquiries"
              placeholder="Search child, parent or phone"
              className="h-9 sm:max-w-xs"
              value={filters.q}
              onChange={(event) => {
                change({ q: event.target.value });
              }}
            />
            <Select
              items={STATUS_OPTIONS}
              value={filters.status}
              onValueChange={(value) => {
                if (value != null) change({ status: value });
              }}
            >
              <SelectTrigger
                aria-label="Status"
                className="w-full min-w-0 sm:w-44"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <FilterTabs
            aria-label="Which Enquiries"
            value={filters.view}
            onValueChange={(view) => {
              change({ view });
            }}
            items={VIEW_TABS}
          />
          <Suspense fallback={<SectionSkeleton />}>
            <EnquiryTable
              centreId={centre.id}
              filters={shownFilters}
              onPage={(cursors) => {
                setFilters((current) => ({ ...current, cursors }));
              }}
              {...handlers}
            />
          </Suspense>
        </div>
      )}
      <EnquiryActionDialog
        action={action}
        onClose={() => {
          setAction(null);
        }}
      />
    </PreschoolPage>
  );
}
