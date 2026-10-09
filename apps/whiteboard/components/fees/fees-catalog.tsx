"use client";

import {
  AlarmClock,
  CalendarClock,
  ClipboardList,
  IndianRupee,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@repo/ui/components/badge";
import { buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Spinner } from "@repo/ui/components/spinner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";

import { PageHeader } from "@/components/app-shell/page-header";
import { CatalogStat } from "@/components/catalog/catalog-chrome";
import { StudentAvatar } from "@/components/students/student-avatar";
import { formatPaiseAsRupees } from "@/lib/money";
import {
  FEE_FOLLOW_UP_CHANNEL_LABELS,
  type FeeDueResponse,
  type FeeDuesFilter,
  type FeeDuesResponse,
  type FeeDuesSort,
  type FeeFollowUpDueResponse,
} from "@/src/queries/fee-dues";

import { feeDateLabel, followUpDueLabel } from "./fees-format";

export const FEE_DUES_FILTERS: {
  value: FeeDuesFilter;
  label: string;
  count: keyof FeeDuesResponse["counts"];
}[] = [
  { value: "overdue", label: "Overdue", count: "overdue" },
  { value: "due_soon", label: "Due soon", count: "dueSoon" },
  { value: "all", label: "All with a balance", count: "all" },
];

export const FEE_DUES_SORTS: { value: FeeDuesSort; label: string }[] = [
  { value: "amount", label: "Amount owed" },
  { value: "due_date", label: "Due date" },
];

function isFilter(value: unknown): value is FeeDuesFilter {
  return FEE_DUES_FILTERS.some((item) => item.value === value);
}

function isSort(value: unknown): value is FeeDuesSort {
  return FEE_DUES_SORTS.some((item) => item.value === value);
}

const EMPTY_COPY: Record<
  Exclude<FeeDuesFilter, "all">,
  { title: string; description: string }
> = {
  overdue: {
    title: "No overdue dues.",
    description:
      "Enrollments that have paid less than their Fee Plan asked for by today show here.",
  },
  due_soon: {
    title: "Nothing due soon.",
    description:
      "Enrollments with an unpaid due date from today to 3 days ahead show here.",
  },
};

export function FeesCatalog({
  dues,
  followUpsDue,
  filter,
  sort,
  updating = false,
  onFilterChange,
  onSortChange,
}: {
  dues: FeeDuesResponse;
  followUpsDue: FeeFollowUpDueResponse[];
  /** The filter and sort the Owner picked; `dues` may still be the last ones while they load. */
  filter: FeeDuesFilter;
  sort: FeeDuesSort;
  updating?: boolean;
  onFilterChange: (filter: FeeDuesFilter) => void;
  onSortChange: (sort: FeeDuesSort) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Fees"
        meta="Remaining dues for every Enrollment, and the Fee Follow-ups due today."
      />
      <section aria-label="Fee summary" className="grid gap-3 sm:grid-cols-3">
        <CatalogStat
          label="Enrollments with dues"
          value={dues.counts.all}
          detail="Active and ended"
          icon={ClipboardList}
          tone="violet"
        />
        <CatalogStat
          label="Remaining dues"
          value={formatPaiseAsRupees(dues.totalRemainingPaise)}
          detail="Across Enrollments with dues"
          icon={IndianRupee}
          tone="emerald"
        />
        <CatalogStat
          label="Overdue"
          value={dues.counts.overdue}
          detail="Behind on their Fee Plan"
          icon={AlarmClock}
          tone="amber"
        />
      </section>
      <FollowUpsDueSection items={followUpsDue} />
      <section
        aria-label="Dues list"
        className="bg-card overflow-hidden rounded-2xl border shadow-sm"
      >
        <Tabs
          value={filter}
          onValueChange={(value) => {
            if (!isFilter(value)) return;
            onFilterChange(value);
          }}
          className="gap-0"
        >
          <div className="flex flex-col gap-3 border-b p-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-0.5">
              <h2 className="font-semibold">Dues list</h2>
              <p className="text-muted-foreground text-xs">
                Open an Enrollment to log a Fee Follow-up or take a Fee Payment
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <TabsList
                aria-label="Dues filters"
                className="grid h-auto! w-full grid-cols-3 sm:inline-flex sm:h-11! sm:w-fit"
              >
                {FEE_DUES_FILTERS.map((item) => {
                  const count = dues.counts[item.count];
                  return (
                    <TabsTrigger
                      key={item.value}
                      value={item.value}
                      className="h-auto min-h-9 px-2 leading-tight whitespace-normal sm:h-full sm:flex-none sm:px-3 sm:whitespace-nowrap"
                    >
                      <span className="text-center text-balance">
                        {item.label}{" "}
                        <span
                          className={`inline-block rounded-full px-1.5 text-xs tabular-nums ${item.value === "overdue" && count > 0 ? "bg-destructive/10 text-destructive dark:bg-destructive/20" : "bg-muted text-muted-foreground"}`}
                        >
                          {count}
                        </span>
                      </span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="fee-dues-sort"
                  className="text-muted-foreground shrink-0 text-sm font-normal"
                >
                  Sort by
                </Label>
                <Select
                  items={FEE_DUES_SORTS}
                  value={sort}
                  onValueChange={(value) => {
                    if (!isSort(value)) return;
                    onSortChange(value);
                  }}
                >
                  <SelectTrigger
                    id="fee-dues-sort"
                    size="lg"
                    className="w-full min-w-0 sm:w-40"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end" alignItemWithTrigger={false}>
                    {FEE_DUES_SORTS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          {FEE_DUES_FILTERS.map((item) => (
            <TabsContent key={item.value} value={item.value}>
              {updating ? (
                <div
                  className="text-muted-foreground flex items-center gap-2 border-b px-4 py-2 text-xs sm:px-6"
                  role="status"
                >
                  <Spinner className="size-4" aria-hidden="true" />
                  Updating the dues list…
                </div>
              ) : null}
              <div
                className={updating ? "opacity-60 transition-opacity" : ""}
                aria-busy={updating}
              >
                {dues.items.length === 0 ? (
                  <EmptyDues filter={dues.filter} />
                ) : (
                  <DueRows items={dues.items} />
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </section>
    </div>
  );
}

function EmptyDues({ filter }: { filter: FeeDuesFilter }) {
  if (filter === "all") {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>No remaining dues.</EmptyTitle>
          <EmptyDescription>
            Remaining dues will show here after an Enrollment has a Fee Plan.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/students" className={buttonVariants()}>
            Open Students
          </Link>
        </EmptyContent>
      </Empty>
    );
  }
  const copy = EMPTY_COPY[filter];
  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyTitle>{copy.title}</EmptyTitle>
        <EmptyDescription>{copy.description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

const amberPill =
  "bg-amber-100 text-amber-900 dark:bg-amber-400/20 dark:text-amber-100";

function DueStatus({ item }: { item: FeeDueResponse }) {
  if (item.dueDatesClarity === "unclear") {
    return (
      <div className="space-y-1">
        <p className="text-muted-foreground font-medium">
          Dates don’t match the Fee Plan
        </p>
        {item.dueDates.length === 0 ? null : (
          <ul
            aria-label="Fee Plan due dates"
            className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums"
          >
            {item.dueDates.map((dueDate) => (
              <li key={dueDate.dueOn}>
                {feeDateLabel(dueDate.dueOn)} ·{" "}
                {formatPaiseAsRupees(dueDate.amountPaise)}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  if (item.overdue && item.oldestUnpaidDueOn != null) {
    return (
      <div className="space-y-0.5">
        <p className="text-destructive font-medium">
          Overdue since {feeDateLabel(item.oldestUnpaidDueOn)}
        </p>
        <p className="text-muted-foreground text-xs tabular-nums">
          {formatPaiseAsRupees(item.overduePaise)} overdue
        </p>
      </div>
    );
  }
  if (item.nextUnpaidDueOn != null) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>Next due {feeDateLabel(item.nextUnpaidDueOn)}</span>
        {item.dueSoon ? <Badge className={amberPill}>Due soon</Badge> : null}
      </p>
    );
  }
  return <p className="text-muted-foreground">No due date</p>;
}

function DueRows({ items }: { items: FeeDueResponse[] }) {
  return (
    <div>
      <div
        aria-hidden="true"
        className="bg-muted/40 text-muted-foreground hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_8rem_auto] gap-4 border-b px-6 py-2.5 text-xs font-medium tracking-wide uppercase lg:grid"
      >
        <span>Student</span>
        <span>Due date</span>
        <span className="text-right">Remaining dues</span>
        <span className="w-36" />
      </div>
      <ul className="divide-y">
        {items.map((item) => {
          const nextFollowUpOn = item.openFollowUp?.nextFollowUpOn ?? null;
          return (
            <li
              key={item.enrollmentId}
              className="relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 px-4 py-4 transition-colors hover:bg-violet-50/60 sm:px-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_8rem_auto] lg:items-center dark:hover:bg-violet-400/5"
            >
              <div className="flex min-w-0 items-center gap-3 lg:col-start-1 lg:row-start-1">
                <StudentAvatar
                  studentId={item.studentId}
                  name={item.studentName}
                  className="size-10 shrink-0"
                />
                <div className="min-w-0">
                  <p className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold">
                      {item.studentName}
                    </span>
                    {item.enrollmentEnded ? (
                      <Badge variant="secondary">Ended</Badge>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {item.courseName} · {item.batchName}
                  </p>
                </div>
              </div>
              <p className="col-start-2 row-start-1 self-center text-right font-semibold text-amber-700 tabular-nums lg:col-start-3 dark:text-amber-200">
                {formatPaiseAsRupees(item.remainingPaise)}
              </p>
              <div className="col-span-2 min-w-0 space-y-1.5 pl-13 text-sm lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:pl-0">
                <DueStatus item={item} />
                {nextFollowUpOn == null ? null : (
                  <p className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 dark:text-violet-300">
                    <CalendarClock aria-hidden="true" className="size-3.5" />
                    Follow up {feeDateLabel(nextFollowUpOn)}
                  </p>
                )}
              </div>
              <div className="col-span-2 pl-13 lg:col-span-1 lg:col-start-4 lg:row-start-1 lg:w-36 lg:pl-0 lg:text-right">
                <Link
                  href={`/enrollments/${item.enrollmentId}`}
                  aria-label={`Open Enrollment for ${item.studentName}`}
                  className={buttonVariants({
                    variant: "outline",
                    size: "sm",
                    className: "after:absolute after:inset-0",
                  })}
                >
                  Open Enrollment
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FollowUpsDueSection({ items }: { items: FeeFollowUpDueResponse[] }) {
  return (
    <section
      aria-labelledby="follow-ups-due-heading"
      className="bg-card overflow-hidden rounded-2xl border shadow-sm"
    >
      <div className="border-b p-4 sm:px-6">
        <h2
          id="follow-ups-due-heading"
          className="flex items-center gap-2 font-semibold"
        >
          Follow-ups due today
          <span
            className={`rounded-full px-1.5 text-xs tabular-nums ${items.length > 0 ? amberPill : "bg-muted text-muted-foreground"}`}
          >
            {items.length}
          </span>
        </h2>
        <p className="text-muted-foreground text-xs">
          Fee Follow-ups whose next date is today or has passed
        </p>
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground px-4 py-6 text-center text-sm sm:px-6">
          No follow-ups due today.
        </p>
      ) : (
        <ul className="divide-y">
          {items.map((item) => (
            <li
              key={item.id}
              className="relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 px-4 py-4 transition-colors hover:bg-violet-50/60 sm:px-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_9rem_8rem] lg:items-center dark:hover:bg-violet-400/5"
            >
              <div className="min-w-0 lg:col-start-1 lg:row-start-1">
                <Link
                  href={`/enrollments/${item.enrollmentId}`}
                  className="focus-visible:ring-ring/50 block truncate rounded-sm font-semibold outline-none after:absolute after:inset-0 focus-visible:ring-3"
                >
                  {item.studentName}
                </Link>
                <p className="text-muted-foreground truncate text-xs">
                  {item.courseName} · {item.batchName}
                </p>
              </div>
              <p className="col-start-2 row-start-1 text-right font-semibold text-amber-700 tabular-nums lg:col-start-4 dark:text-amber-200">
                {formatPaiseAsRupees(item.remainingPaise)}
              </p>
              <p className="col-span-2 min-w-0 truncate text-sm lg:col-span-1 lg:col-start-2 lg:row-start-1">
                <span className="font-medium">
                  {FEE_FOLLOW_UP_CHANNEL_LABELS[item.channel]}
                </span>
                {item.note == null || item.note.trim() === "" ? null : (
                  <span className="text-muted-foreground">
                    {" · "}
                    {item.note}
                  </span>
                )}
              </p>
              <p className="col-span-2 flex flex-wrap items-center gap-x-2 text-xs lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:block lg:space-y-0.5">
                <span className="text-muted-foreground lg:block">
                  {feeDateLabel(item.nextFollowUpOn)}
                </span>
                <span
                  className={`font-medium lg:block ${item.daysOverdue > 0 ? "text-destructive" : "text-amber-700 dark:text-amber-300"}`}
                >
                  {followUpDueLabel(item.daysOverdue)}
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
