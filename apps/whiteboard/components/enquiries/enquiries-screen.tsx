"use client";

import { useAuth } from "@repo/auth/react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { CalendarClock, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  startTransition,
  useEffect,
  useState,
  useTransition,
} from "react";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Input } from "@repo/ui/components/input";
import { Spinner } from "@repo/ui/components/spinner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";

import { PageHeader } from "@/components/app-shell/page-header";
import {
  CatalogPagination,
  CatalogStatus,
} from "@/components/catalog/catalog-chrome";
import { isOwnerRole } from "@/lib/workspace-access";
import {
  enquiryQueries,
  type EnquiryListView,
  type EnquiryResponse,
} from "@/src/queries/enquiries";

import {
  enquiryInterest,
  preferredClassModeLabel,
  shortDate,
} from "./enquiry-format";
import { EnquiryStageBadge } from "./enquiry-stage-badge";

const PAGE_SIZE = 20;

const VIEWS: { value: EnquiryListView; label: string }[] = [
  { value: "due", label: "Follow-ups due" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

function isView(value: unknown): value is EnquiryListView {
  return VIEWS.some((view) => view.value === value);
}

const EMPTY_COPY: Record<
  EnquiryListView,
  { title: string; description: string }
> = {
  due: {
    title: "No follow-ups due today.",
    description:
      "Open Enquiries with a follow-up date of today or earlier show here.",
  },
  open: {
    title: "No open Enquiries.",
    description:
      "When someone calls or walks in asking about a Course, add an Enquiry so nobody forgets to follow up.",
  },
  closed: {
    title: "No closed Enquiries yet.",
    description: "Enquiries that joined or weren't interested show here.",
  },
  all: {
    title: "No Enquiries yet.",
    description:
      "Record every call and walk-in here, then follow up, book a demo, and convert them into Students.",
  },
};

export function EnquiriesScreen() {
  const { role } = useAuth();
  const isOwner = isOwnerRole(role);
  const searchParams = useSearchParams();
  const initialView = searchParams.get("view");
  const [view, setView] = useState<EnquiryListView>(
    isView(initialView) ? initialView : "open",
  );
  const [search, setSearch] = useState("");
  const [q, setQ] = useState<string | undefined>(undefined);
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = search.trim();
      startTransition(() => {
        setQ(next.length === 0 ? undefined : next);
      });
    }, 300);
    return () => {
      window.clearTimeout(handle);
    };
  }, [search]);
  const due = useQuery(enquiryQueries.list({ view: "due", limit: 1 }));
  const dueCount = due.data?.total;

  return (
    <main className="w-full p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          title="Enquiries"
          meta="Calls, walk-ins, and referrals asking about a Course, from first call to admission."
          actions={
            <>
              {isOwner ? (
                <>
                  <Button
                    variant="outline"
                    render={<Link href="/enquiries/sources" />}
                  >
                    Sources
                  </Button>
                  <Button
                    variant="outline"
                    render={<Link href="/enquiries/summary" />}
                  >
                    Summary
                  </Button>
                </>
              ) : null}
              <Button render={<Link href="/enquiries/new" />}>
                <Plus aria-hidden="true" />
                Add enquiry
              </Button>
            </>
          }
        />
        <Tabs
          value={view}
          onValueChange={(value) => {
            if (!isView(value)) return;
            setView(value);
          }}
          className="gap-4"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-1">
              <TabsList aria-label="Enquiry lists">
                {VIEWS.map((item) => (
                  <TabsTrigger
                    key={item.value}
                    value={item.value}
                    className="flex-none px-3 sm:px-4"
                  >
                    {item.label}
                    {item.value === "due" && dueCount != null ? (
                      <>
                        <span
                          aria-hidden="true"
                          className={`rounded-full px-1.5 text-xs tabular-nums ${dueCount > 0 ? "bg-amber-100 text-amber-900 dark:bg-amber-400/20 dark:text-amber-100" : "bg-muted text-muted-foreground"}`}
                        >
                          {dueCount}
                        </span>
                        <span className="sr-only">{dueCount} due</span>
                      </>
                    ) : null}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <div className="relative w-full md:w-72">
              <Search
                aria-hidden="true"
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              />
              <Input
                id="enquiry-search"
                className="h-10 pl-9"
                placeholder="Search by name or phone"
                aria-label="Search by name or phone"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
              />
            </div>
          </div>
          {VIEWS.map((item) => (
            <TabsContent key={item.value} value={item.value}>
              <section
                aria-label={item.label}
                className="bg-card overflow-hidden rounded-2xl border shadow-sm"
              >
                <Suspense fallback={<CatalogStatus noun="Enquiries" />}>
                  <EnquiryResults
                    view={item.value}
                    q={q}
                    searching={search.trim() !== (q ?? "")}
                    onShowOpen={() => {
                      setView("open");
                    }}
                  />
                </Suspense>
              </section>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </main>
  );
}

function EnquiryResults({
  view,
  q,
  searching,
  onShowOpen,
}: {
  view: EnquiryListView;
  q: string | undefined;
  searching: boolean;
  onShowOpen: () => void;
}) {
  const [page, setPage] = useState(1);
  const [cursor, setCursor] = useState<{ after?: string; before?: string }>({});
  const [scope, setScope] = useState(q);
  const [pending, startPageTransition] = useTransition();
  if (scope !== q) {
    // A new search starts again from the first page.
    setScope(q);
    setCursor({});
    setPage(1);
  }
  const { data } = useSuspenseQuery(
    enquiryQueries.list({ view, q, limit: PAGE_SIZE, ...cursor }),
  );
  const updating = pending || searching;

  return (
    <>
      {updating ? (
        <div
          className="text-muted-foreground flex items-center gap-2 border-b px-4 py-2 text-xs sm:px-6"
          role="status"
        >
          <Spinner className="size-4" aria-hidden="true" />
          Updating Enquiries…
        </div>
      ) : null}
      {data.items.length === 0 ? (
        <EmptyResults view={view} q={q} onShowOpen={onShowOpen} />
      ) : (
        <>
          <EnquiryRows enquiries={data.items} />
          <CatalogPagination
            noun="Enquiries"
            count={data.items.length}
            pagination={{
              total: data.total,
              page,
              pageSize: PAGE_SIZE,
              hasNext: data.nextCursor != null,
              hasPrevious: data.prevCursor != null,
              onNext: () => {
                if (data.nextCursor == null) return;
                const after = data.nextCursor;
                startPageTransition(() => {
                  setCursor({ after });
                  setPage((current) => current + 1);
                });
              },
              onPrevious: () => {
                if (data.prevCursor == null) return;
                const before = data.prevCursor;
                startPageTransition(() => {
                  setCursor({ before });
                  setPage((current) => current - 1);
                });
              },
            }}
          />
        </>
      )}
    </>
  );
}

function EmptyResults({
  view,
  q,
  onShowOpen,
}: {
  view: EnquiryListView;
  q: string | undefined;
  onShowOpen: () => void;
}) {
  if (q != null) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>No Enquiries match “{q}”.</EmptyTitle>
          <EmptyDescription>
            Search by the prospect’s name or phone number.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  const copy = EMPTY_COPY[view];
  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyTitle>{copy.title}</EmptyTitle>
        <EmptyDescription>{copy.description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {view === "due" ? (
          <Button type="button" variant="outline" onClick={onShowOpen}>
            See open Enquiries
          </Button>
        ) : view === "closed" ? null : (
          <Button render={<Link href="/enquiries/new" />}>
            <Plus aria-hidden="true" />
            Add enquiry
          </Button>
        )}
      </EmptyContent>
    </Empty>
  );
}

function FollowUpCell({ enquiry }: { enquiry: EnquiryResponse }) {
  if (enquiry.nextFollowUpOn == null) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (enquiry.followUpDue) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
        <CalendarClock aria-hidden="true" className="size-4" />
        Due {shortDate(enquiry.nextFollowUpOn)}
      </span>
    );
  }
  return <span>{shortDate(enquiry.nextFollowUpOn)}</span>;
}

function EnquiryRows({ enquiries }: { enquiries: EnquiryResponse[] }) {
  return (
    <div>
      <div
        aria-hidden="true"
        className="bg-muted/40 text-muted-foreground hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_8.5rem_7.5rem] gap-4 border-b px-6 py-2.5 text-xs font-medium tracking-wide uppercase md:grid"
      >
        <span>Prospect</span>
        <span>Interest</span>
        <span>Source</span>
        <span>Stage</span>
        <span>Next follow-up</span>
      </div>
      <ul className="divide-y">
        {enquiries.map((enquiry) => {
          const interest = enquiryInterest(enquiry);
          return (
            <li
              key={enquiry.id}
              className="relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 px-4 py-4 transition-colors hover:bg-violet-50/60 sm:px-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_8.5rem_7.5rem] md:items-center md:gap-y-0 dark:hover:bg-violet-400/5"
            >
              <div className="min-w-0 md:col-start-1 md:row-start-1">
                <Link
                  href={`/enquiries/${enquiry.id}`}
                  className="focus-visible:ring-ring/50 block truncate rounded-sm font-semibold outline-none after:absolute after:inset-0 focus-visible:ring-3"
                >
                  {enquiry.prospectName}
                </Link>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {enquiry.phone}
                </p>
              </div>
              <div className="col-start-2 row-start-1 justify-self-end md:col-start-4 md:justify-self-start">
                <EnquiryStageBadge
                  stage={enquiry.stage}
                  followUpDue={enquiry.followUpDue}
                />
              </div>
              <div className="col-span-2 min-w-0 text-sm md:col-span-1 md:col-start-2 md:row-start-1">
                <p className="truncate">
                  {interest ?? (
                    <span className="text-muted-foreground">
                      Not decided yet
                    </span>
                  )}
                  <span className="text-muted-foreground md:hidden">
                    {" · "}
                    {preferredClassModeLabel(enquiry.preferredClassMode)}
                  </span>
                </p>
                <p className="text-muted-foreground hidden text-xs md:block">
                  {preferredClassModeLabel(enquiry.preferredClassMode)}
                </p>
              </div>
              <p className="text-muted-foreground col-span-2 min-w-0 truncate text-sm md:col-span-1 md:col-start-3 md:row-start-1">
                <span className="md:hidden">Source: </span>
                {enquiry.source?.name ?? "—"}
              </p>
              <p
                className={`col-span-2 text-sm md:col-span-1 md:col-start-5 md:row-start-1 ${enquiry.nextFollowUpOn == null ? "hidden md:block" : ""}`}
              >
                <span className="text-muted-foreground md:hidden">
                  Next follow-up:{" "}
                </span>
                <FollowUpCell enquiry={enquiry} />
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
