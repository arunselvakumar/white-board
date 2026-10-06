import Link from "next/link";
import { ArrowRight, CalendarDays, Clock3, MonitorPlay } from "lucide-react";

import { Badge } from "@repo/ui/components/badge";

import { formatDate } from "@/lib/calendar-dates";
import { classChangeSummary, classMarker, isOff } from "@/lib/class-changes";
import { upcomingOnlineClasses } from "@/lib/online-classes";
import type {
  CalendarItem,
  ClassChange,
  Holiday,
} from "@/src/queries/calendar";
import { classPath } from "@/src/queries/classes";

function timeLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

export function OnlineClassesView({
  items,
  classChanges = [],
  holidays = [],
  now = new Date(),
}: {
  items: CalendarItem[];
  classChanges?: ClassChange[];
  holidays?: Holiday[];
  now?: Date;
}) {
  const classes = upcomingOnlineClasses(items, now, 30, {
    classChanges,
    holidays,
  });
  const byDate = new Map<string, typeof classes>();
  for (const occurrence of classes) {
    const occurrences = byDate.get(occurrence.date) ?? [];
    occurrences.push(occurrence);
    byDate.set(occurrence.date, occurrences);
  }

  if (classes.length === 0) {
    return (
      <main className="w-full p-6">
        <div className="bg-card mx-auto w-full max-w-4xl rounded-2xl border px-6 py-14 text-center shadow-sm">
          <div className="bg-primary/10 text-primary mx-auto flex size-12 items-center justify-center rounded-xl">
            <MonitorPlay className="size-6" />
          </div>
          <h1 className="mt-5 text-xl font-semibold">
            No upcoming online classes
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Online and Hybrid Batch Timings for the next 30 days will appear
            here.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="w-full p-6">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-7">
          <p className="text-primary flex items-center gap-2 text-sm font-medium">
            <MonitorPlay className="size-4" /> Next 30 days
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Online Classes</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Open a class to join its Whiteboard stream or external meeting link.
          </p>
        </div>
        <div className="space-y-7">
          {[...byDate.entries()].map(([date, occurrences]) => (
            <section key={date} aria-labelledby={`date-${date}`}>
              <h2
                id={`date-${date}`}
                className="mb-3 flex items-center gap-2 text-sm font-semibold"
              >
                <CalendarDays className="text-primary size-4" />
                {formatDate(date, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </h2>
              <div className="space-y-3">
                {occurrences.map((occurrence) => {
                  const { item, scheduled } = occurrence;
                  const startTime = scheduled.startTime;
                  const marker = classMarker(scheduled);
                  const summary = classChangeSummary(scheduled);
                  return (
                    <Link
                      key={occurrence.id}
                      href={classPath(item.batchId, occurrence.date, startTime)}
                      aria-label={`Open ${item.courseName} class`}
                      className={`group bg-card hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-ring flex items-center gap-4 rounded-2xl border p-4 shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:p-5 ${isOff(scheduled) ? "opacity-70" : ""}`}
                    >
                      <div className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
                        <Clock3 className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 font-semibold">
                          <span
                            className={
                              isOff(scheduled) ? "line-through" : undefined
                            }
                          >
                            {item.courseName}
                          </span>
                          {marker && (
                            <Badge
                              variant={
                                isOff(scheduled) ? "destructive" : "secondary"
                              }
                            >
                              {marker}
                            </Badge>
                          )}
                        </p>
                        <p className="text-muted-foreground mt-0.5 truncate text-sm">
                          {item.batchName}
                          {item.studentName ? ` · ${item.studentName}` : ""}
                        </p>
                        <p className="mt-2 text-sm font-medium">
                          {timeLabel(occurrence.startMinutes)}–
                          {timeLabel(occurrence.endMinutes)}{" "}
                          <span className="text-muted-foreground">
                            ·{" "}
                            {item.classMode === "hybrid" ? "Hybrid" : "Online"}
                          </span>
                        </p>
                        {summary && (
                          <p className="text-muted-foreground mt-1 text-xs">
                            {summary}
                          </p>
                        )}
                      </div>
                      <ArrowRight className="text-muted-foreground group-hover:text-primary size-5 shrink-0 transition-transform group-hover:translate-x-1" />
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
