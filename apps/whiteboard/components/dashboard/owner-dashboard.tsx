"use client";

import {
  ArrowUpRight,
  Banknote,
  BellRing,
  BookOpen,
  CalendarClock,
  ChevronRight,
  GraduationCap,
  Layers,
  Plus,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@repo/ui/components/button";

import { classModeLabel } from "@/lib/class-mode";
import { formatPaiseAsRupees } from "@/lib/money";
import {
  studentAvatarColor,
  studentInitials,
} from "@/lib/student-avatar-style";
import type { DashboardResponse } from "@/src/queries/dashboard";

const CLASS_MODE_TONE: Record<string, string> = {
  offline: "bg-chart-3/12 text-chart-3",
  online: "bg-chart-2/12 text-chart-2",
  hybrid: "bg-primary/12 text-primary",
};

const QUICK_ACTIONS: readonly {
  href: string;
  label: string;
  icon: LucideIcon;
}[] = [
  { href: "/courses/new", label: "Add Course", icon: BookOpen },
  { href: "/batches/new", label: "Open a Batch", icon: Layers },
  { href: "/fees", label: "Take a Fee Payment", icon: Banknote },
];

function admittedDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

/** A white card on the grey canvas, titled, with an optional link on the right. */
function Panel({
  title,
  aside,
  children,
  className = "",
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`bg-card flex min-w-0 flex-col rounded-2xl border shadow-xs ${className}`}
    >
      <header className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
        <h2 className="text-base tracking-tight">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

function StatCard({
  label,
  value,
  caption,
  icon: Icon,
  tone,
  valueTone = "",
  onClick,
}: {
  label: string;
  value: ReactNode;
  caption: string;
  icon: LucideIcon;
  tone: string;
  valueTone?: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="group bg-card hover:bg-card hover:border-primary/35 dark:bg-card dark:hover:bg-card h-auto flex-col items-stretch gap-4 rounded-2xl p-4 text-left font-normal whitespace-normal shadow-xs sm:p-5"
      onClick={onClick}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="text-muted-foreground text-sm">{label}</span>
        <ArrowUpRight
          aria-hidden="true"
          className="text-muted-foreground group-hover:text-primary transition-colors"
        />
      </span>
      <span className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl sm:size-11 ${tone}`}
        >
          <Icon className="size-5" />
        </span>
        <span
          className={`truncate text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl ${valueTone}`}
        >
          {value}
        </span>
      </span>
      <span className="text-muted-foreground text-xs">{caption}</span>
    </Button>
  );
}

function PanelLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-muted-foreground"
      onClick={onClick}
    >
      {label}
      <ChevronRight aria-hidden="true" />
    </Button>
  );
}

export function OwnerDashboard({
  dashboard,
  hasCourses,
  onAddCourse,
  onOpenBatch,
  onOpenStudent,
  onOpenStudents,
  onOpenFees,
  onOpenCalendar,
}: {
  dashboard: DashboardResponse;
  hasCourses: boolean;
  onAddCourse: () => void;
  onOpenBatch: (id: string) => void;
  onOpenStudent: (id: string) => void;
  onOpenStudents: () => void;
  onOpenFees: () => void;
  onOpenCalendar: () => void;
}) {
  const followUpsDue = dashboard.feeFollowUpsDueCount > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            Owner Dashboard
          </h1>
          <p className="text-muted-foreground text-sm">
            Students, dues and today’s Batches at a glance.
          </p>
        </div>
        <Button render={<Link href="/students/new" />}>
          <Plus aria-hidden="true" />
          Add Student
        </Button>
      </header>

      {hasCourses ? null : (
        <div className="border-primary/30 bg-primary/5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed p-5">
          <p className="text-sm">Add the first Course this centre teaches.</p>
          <Button type="button" variant="outline" onClick={onAddCourse}>
            Add Course
          </Button>
        </div>
      )}

      <div className="@container">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 @4xl:grid-cols-4">
          <StatCard
            label="Active Students"
            value={dashboard.activeStudentCount}
            caption="Students on the register"
            icon={GraduationCap}
            tone="bg-primary/12 text-primary"
            onClick={onOpenStudents}
          />
          <StatCard
            label="Outstanding dues"
            value={formatPaiseAsRupees(dashboard.outstandingDuesPaise)}
            caption="Still to collect across Enrollments"
            icon={Wallet}
            tone="bg-chart-4/12 text-chart-4"
            onClick={onOpenFees}
          />
          <StatCard
            label="Follow-ups due today"
            value={dashboard.feeFollowUpsDueCount}
            caption={
              followUpsDue
                ? "Fee Follow-ups waiting on you"
                : "Nothing to chase"
            }
            icon={BellRing}
            tone={
              followUpsDue
                ? "bg-chart-5/12 text-chart-5"
                : "bg-muted text-muted-foreground"
            }
            valueTone={followUpsDue ? "text-amber-700 dark:text-amber-200" : ""}
            onClick={onOpenFees}
          />
          <StatCard
            label="Batches today"
            value={dashboard.todayBatches.length}
            caption="Running on today’s Calendar"
            icon={CalendarClock}
            tone="bg-chart-2/12 text-chart-2"
            onClick={onOpenCalendar}
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          title="Today’s Batches"
          className="xl:col-span-2"
          aside={<PanelLink label="Calendar" onClick={onOpenCalendar} />}
        >
          {dashboard.todayBatches.length === 0 ? (
            <p className="text-muted-foreground mx-5 mb-5 rounded-xl border border-dashed p-6 text-center text-sm">
              No Batches run today.
            </p>
          ) : (
            <ul className="divide-border/70 mb-2 divide-y px-2">
              {dashboard.todayBatches.map((batch) => {
                const first = batch.todayClasses[0];
                const fill =
                  batch.capacity > 0
                    ? Math.min(
                        100,
                        (batch.enrolledCount / batch.capacity) * 100,
                      )
                    : 0;
                return (
                  <li key={batch.id}>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto w-full justify-start gap-4 rounded-xl px-3 py-3 text-left font-normal whitespace-normal"
                      onClick={() => {
                        onOpenBatch(batch.id);
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className="bg-secondary flex w-16 shrink-0 flex-col items-center rounded-xl py-2"
                      >
                        <span className="text-sm font-semibold tabular-nums">
                          {first?.startTime ?? "—"}
                        </span>
                        <span className="text-muted-foreground text-[11px] tabular-nums">
                          {first?.endTime ?? ""}
                        </span>
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate font-semibold">
                          {batch.name}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          Today{" "}
                          {batch.todayClasses
                            .map((slot) => `${slot.startTime}–${slot.endTime}`)
                            .join(", ")}
                          {batch.todayClasses.some(
                            (slot) => slot.rescheduled,
                          ) && " · Rescheduled"}
                        </span>
                      </span>
                      <span
                        className={`hidden shrink-0 rounded-full px-2.5 py-0.5 text-xs sm:inline ${CLASS_MODE_TONE[batch.classMode] ?? "bg-muted"}`}
                      >
                        {classModeLabel(batch.classMode)}
                      </span>
                      <span className="hidden w-28 shrink-0 flex-col gap-1.5 md:flex">
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {batch.enrolledCount}/{batch.capacity} enrolled
                        </span>
                        <span className="bg-secondary h-1.5 overflow-hidden rounded-full">
                          <span
                            className="bg-primary block h-full rounded-full"
                            style={{ width: `${String(fill)}%` }}
                          />
                        </span>
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className="text-muted-foreground shrink-0"
                      />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Quick actions">
          <ul className="grid gap-2 px-5 pb-5">
            {QUICK_ACTIONS.map((action) => (
              <li key={action.href}>
                <Link
                  href={action.href}
                  className="hover:border-primary/35 hover:bg-secondary/60 focus-visible:ring-ring/50 flex items-center gap-3 rounded-xl border p-3 text-sm transition-colors outline-none focus-visible:ring-3"
                >
                  <span
                    aria-hidden="true"
                    className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg"
                  >
                    <action.icon className="size-4" />
                  </span>
                  <span className="flex-1">{action.label}</span>
                  <ChevronRight
                    aria-hidden="true"
                    className="text-muted-foreground size-4"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel
        title="Recent Students"
        aside={<PanelLink label="All Students" onClick={onOpenStudents} />}
      >
        {dashboard.recentStudents.length === 0 ? (
          <p className="text-muted-foreground mx-5 mb-5 rounded-xl border border-dashed p-6 text-center text-sm">
            No Students admitted yet.
          </p>
        ) : (
          <div className="overflow-x-auto px-2 pb-2">
            <table className="w-full min-w-[30rem] text-sm">
              <thead>
                <tr className="text-muted-foreground text-left text-[11px] tracking-[0.08em] uppercase">
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Student
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Phone
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Admitted
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border/70 divide-y border-t">
                {dashboard.recentStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-secondary/50">
                    <td className="px-3 py-2.5">
                      <Button
                        type="button"
                        variant="link"
                        className="text-foreground h-auto gap-3 p-0 font-semibold"
                        onClick={() => {
                          onOpenStudent(student.id);
                        }}
                      >
                        <span
                          aria-hidden="true"
                          className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs ${studentAvatarColor(student.id, student.name)}`}
                        >
                          {studentInitials(student.name)}
                        </span>
                        <span>{student.name}</span>
                      </Button>
                    </td>
                    <td className="text-muted-foreground px-3 py-2.5 tabular-nums">
                      {student.phone}
                    </td>
                    <td className="text-muted-foreground px-3 py-2.5">
                      {admittedDate(student.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
