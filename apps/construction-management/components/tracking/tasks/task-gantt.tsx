"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ChartGantt, ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { cn } from "@repo/ui/lib/utils";

import {
  taskGanttQuery,
  tasksPath,
  type Task,
  type TaskFilters,
} from "@/src/queries/tracking-tasks";
import { addDays, daysBetween } from "@/src/shared-kernel/calendar-date";
import {
  TASK_STATUS_LABELS,
  TASK_STATUSES,
} from "@/src/tracking/domain/task-progress";

import { dateRange, formatPercent, STATUS_STYLES } from "./task-parts";

export type GanttScale = "day" | "week" | "month";

/** Pixels per day at each scale. */
const DAY_WIDTH: Record<GanttScale, number> = { day: 28, week: 8, month: 3 };
const ROW = 40;
const HEADER = 36;
const NAME_WIDTH = 168;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

type Tick = { date: string; label: string; strong: boolean };

/** Header ticks for the chart's range. */
export function ganttTicks(
  start: string,
  end: string,
  scale: GanttScale,
): Tick[] {
  const ticks: Tick[] = [];
  const total = daysBetween(start, end);
  for (let offset = 0; offset <= total; offset += 1) {
    const date = addDays(start, offset);
    const day = Number(date.slice(8, 10));
    const month = MONTHS[Number(date.slice(5, 7)) - 1] ?? "";
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (scale === "day")
      ticks.push({
        date,
        label: day === 1 ? `${String(day)} ${month}` : String(day),
        strong: day === 1,
      });
    else if (scale === "week" && weekday === 1)
      ticks.push({ date, label: `${String(day)} ${month}`, strong: day <= 7 });
    else if (scale === "month" && day === 1)
      ticks.push({
        date,
        label: `${month} ${date.slice(2, 4)}`,
        strong: date.slice(5, 7) === "01",
      });
  }
  return ticks;
}

/** The dates the chart spans: every task's planned, baseline and actual dates and today, padded. */
export function ganttRange(
  items: readonly Task[],
  today: string,
  scale: GanttScale,
): { start: string; end: string } | null {
  const dates = items.flatMap((item) =>
    [
      item.startDate,
      item.dueDate,
      item.baselineStart,
      item.baselineEnd,
      item.actualStart,
      item.actualEnd,
    ].filter((date): date is string => date != null),
  );
  if (dates.length === 0) return null;
  dates.push(today);
  dates.sort();
  const pad = scale === "day" ? 2 : scale === "week" ? 7 : 15;
  let start = addDays(dates[0] ?? today, -pad);
  if (scale === "week") {
    const weekday = new Date(`${start}T00:00:00Z`).getUTCDay();
    start = addDays(start, -((weekday + 6) % 7));
  } else if (scale === "month") start = `${start.slice(0, 7)}-01`;
  return { start, end: addDays(dates.at(-1) ?? today, pad) };
}

function Bars({
  task,
  y,
  x,
}: {
  task: Task;
  y: number;
  x: (date: string) => number;
}) {
  const style = STATUS_STYLES[task.status];
  const parts: ReactNode[] = [];
  const plannedStart = task.startDate ?? task.dueDate;
  const plannedEnd = task.dueDate ?? task.startDate;
  if (plannedStart != null && plannedEnd != null) {
    const left = x(plannedStart);
    const width = Math.max(x(addDays(plannedEnd, 1)) - left, 3);
    const done = (width * Math.min(100, task.progressPct)) / 100;
    parts.push(
      <rect
        key="planned"
        x={left}
        y={y + 8}
        width={width}
        height={16}
        rx={3}
        className={cn(style.bar, "opacity-35")}
      />,
      <rect
        key="done"
        x={left}
        y={y + 8}
        width={done}
        height={16}
        rx={3}
        className={style.bar}
      />,
    );
  }
  if (task.baselineStart != null && task.baselineEnd != null) {
    const left = x(task.baselineStart);
    parts.push(
      <rect
        key="baseline"
        x={left}
        y={y + 28}
        width={Math.max(x(addDays(task.baselineEnd, 1)) - left, 2)}
        height={4}
        rx={2}
        className="fill-foreground/60"
      />,
    );
  }
  return <g>{parts}</g>;
}

/**
 * The read-only Gantt (CM-802, ADR CM-0019 §12): the task tree as rows
 * (expand / collapse), each planned span as a bar coloured by status and
 * shaded to the progress %, the baseline as a thin bar beneath and a Today
 * line; Day, Week and Month scales. A row opens its task. The chart
 * scrolls sideways inside its card; the page does not.
 */
export function TaskGanttChart({
  projectId,
  items,
  today,
  initialScale = "week",
}: {
  projectId: string;
  items: readonly Task[];
  today: string;
  initialScale?: GanttScale;
}) {
  const router = useRouter();
  const [scale, setScale] = useState<GanttScale>(initialScale);
  const scroller = useRef<HTMLDivElement>(null);
  // The card's width: the time axis runs at least that far.
  const [cardWidth, setCardWidth] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const measure = useCallback((element: HTMLDivElement | null) => {
    scroller.current = element;
    observer.current?.disconnect();
    observer.current = null;
    if (element == null) return;
    observer.current = new ResizeObserver(([entry]) => {
      setCardWidth(entry?.contentRect.width ?? 0);
    });
    observer.current.observe(element);
  }, []);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const rows = useMemo(() => {
    const byId = new Map(items.map((item) => [item.id, item]));
    return items.filter((item) => {
      let parentId = item.parentId;
      while (parentId != null) {
        if (collapsed.has(parentId)) return false;
        parentId = byId.get(parentId)?.parentId ?? null;
      }
      return true;
    });
  }, [items, collapsed]);
  const range = ganttRange(items, today, scale);
  const start = range?.start ?? null;
  // Open with Today in view (a third from the left of the timeline).
  useEffect(() => {
    const element = scroller.current;
    if (element == null || start == null) return;
    const offset = daysBetween(start, today) * DAY_WIDTH[scale];
    element.scrollLeft = Math.max(
      0,
      offset - (element.clientWidth - NAME_WIDTH) / 3,
    );
  }, [start, today, scale]);
  if (range == null)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ChartGantt />
          </EmptyMedia>
          <EmptyTitle>Nothing to chart yet</EmptyTitle>
          <EmptyDescription>
            Give tasks a Start Date and a Due Date to see them on the Gantt.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  const unit = DAY_WIDTH[scale];
  const fill = Math.ceil((cardWidth - NAME_WIDTH) / unit);
  const span = Math.max(daysBetween(range.start, range.end) + 1, fill);
  const end = addDays(range.start, span - 1);
  const width = span * unit;
  const x = (date: string) => daysBetween(range.start, date) * unit;
  const height = HEADER + rows.length * ROW;
  const ticks = ganttTicks(range.start, end, scale);
  const todayX = x(today) + unit / 2;

  return (
    <section aria-label="Gantt" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          aria-label="Scale"
          value={[scale]}
          onValueChange={(value: string[]) => {
            const next = value[0];
            if (next === "day" || next === "week" || next === "month")
              setScale(next);
          }}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="day">Day</ToggleGroupItem>
          <ToggleGroupItem value="week">Week</ToggleGroupItem>
          <ToggleGroupItem value="month">Month</ToggleGroupItem>
        </ToggleGroup>
        <ul
          aria-label="Legend"
          className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs"
        >
          {TASK_STATUSES.map((status) => (
            <li key={status} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={cn(
                  "h-2.5 w-4 rounded-sm",
                  STATUS_STYLES[status].swatch,
                )}
              />
              {TASK_STATUS_LABELS[status]}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="bg-foreground/60 h-1 w-4 rounded-sm"
            />
            Baseline
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-3 w-0.5 bg-red-600" />
            Today
          </li>
        </ul>
      </div>
      <div className="bg-card overflow-hidden rounded-lg border">
        <div
          ref={measure}
          className="overflow-x-auto"
          data-testid="gantt-scroll"
        >
          <div
            className="relative flex"
            style={{ width: NAME_WIDTH + width, height }}
          >
            <ul
              aria-label="Gantt rows"
              className="bg-card sticky left-0 z-10 shrink-0 border-r"
              style={{ width: NAME_WIDTH, paddingTop: HEADER }}
            >
              {rows.map((task) => (
                <li
                  key={task.id}
                  className={cn(
                    "flex items-center gap-1 border-t px-2 text-sm",
                    task.contextOnly && "text-muted-foreground",
                  )}
                  style={{
                    height: ROW,
                    paddingLeft: `${String(0.5 + (task.depth - 1) * 0.75)}rem`,
                  }}
                >
                  {task.childCount > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-expanded={!collapsed.has(task.id)}
                      aria-label={`${collapsed.has(task.id) ? "Expand" : "Collapse"} ${task.label}`}
                      onClick={() => {
                        setCollapsed((current) => {
                          const next = new Set(current);
                          if (next.has(task.id)) next.delete(task.id);
                          else next.add(task.id);
                          return next;
                        });
                      }}
                    >
                      {collapsed.has(task.id) ? (
                        <ChevronRight aria-hidden="true" />
                      ) : (
                        <ChevronDown aria-hidden="true" />
                      )}
                    </Button>
                  ) : (
                    <span className="size-6 shrink-0" aria-hidden="true" />
                  )}
                  {task.contextOnly ? (
                    <span className="truncate">
                      {task.label} {task.name}
                    </span>
                  ) : (
                    <Link
                      href={tasksPath(projectId, task.id)}
                      className="truncate hover:underline"
                      title={`${task.label} ${task.name} · ${TASK_STATUS_LABELS[task.status]} · ${formatPercent(task.progressPct)} · ${dateRange(task.startDate, task.dueDate)}`}
                    >
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {task.label}
                      </span>{" "}
                      {task.name}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            <svg
              width={width}
              height={height}
              aria-hidden="true"
              data-testid="gantt-chart"
              data-rows={rows.length}
              className="block shrink-0"
            >
              {ticks.map((tick) => (
                <g key={tick.date}>
                  <line
                    x1={x(tick.date)}
                    x2={x(tick.date)}
                    y1={HEADER - 8}
                    y2={height}
                    className={
                      tick.strong ? "stroke-border" : "stroke-border/50"
                    }
                  />
                  <text
                    x={x(tick.date) + 3}
                    y={HEADER - 14}
                    className="fill-muted-foreground text-[10px]"
                  >
                    {tick.label}
                  </text>
                </g>
              ))}
              {rows.map((task, index) => {
                const y = HEADER + index * ROW;
                return (
                  <g
                    key={task.id}
                    className={cn(task.contextOnly && "opacity-50")}
                  >
                    <line
                      x1={0}
                      x2={width}
                      y1={y}
                      y2={y}
                      className="stroke-border"
                    />
                    {task.contextOnly ? (
                      <Bars task={task} y={y} x={x} />
                    ) : (
                      <a
                        href={tasksPath(projectId, task.id)}
                        tabIndex={-1}
                        className="cursor-pointer"
                        onClick={(event) => {
                          event.preventDefault();
                          router.push(tasksPath(projectId, task.id));
                        }}
                      >
                        <rect
                          x={0}
                          y={y}
                          width={width}
                          height={ROW}
                          className="fill-transparent hover:fill-black/5"
                        />
                        <Bars task={task} y={y} x={x} />
                      </a>
                    )}
                    <title>
                      {`${task.label} ${task.name}: ${TASK_STATUS_LABELS[task.status]}, ${formatPercent(task.progressPct)}, ${dateRange(task.startDate, task.dueDate)}`}
                    </title>
                  </g>
                );
              })}
              <line
                x1={todayX}
                x2={todayX}
                y1={HEADER - 8}
                y2={height}
                strokeDasharray="4 3"
                className="stroke-red-600"
                strokeWidth={1.5}
              />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The Gantt tab: the Project's tree with the list's filters. */
export function TaskGantt({
  projectId,
  filters,
}: {
  projectId: string;
  filters: TaskFilters;
}) {
  const { data } = useSuspenseQuery(taskGanttQuery(projectId, filters));
  return (
    <TaskGanttChart
      projectId={projectId}
      items={data.items}
      today={data.today}
    />
  );
}
