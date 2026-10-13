"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Switch } from "@repo/ui/components/switch";

import {
  REPORT_ENUM_FILTER_ITEMS,
  REPORT_FILTER_LABELS,
  REPORT_FILTER_PARAMS,
  withReportParam,
} from "@/lib/report-params";
import type {
  ReportCatalogueItem,
  ReportOption,
  ReportOptionsResponse,
  ReportParamName,
  ReportParams,
} from "@/src/queries/reports";
import type {
  ReportFilter,
  ReportRole,
} from "@/src/training-institute/domain/report-catalogue";
import { formatMonth } from "@/src/training-institute/domain/report-format";
import {
  REPORT_PERIOD_LABELS,
  REPORT_PERIOD_PRESETS,
  shiftMonth,
} from "@/src/training-institute/domain/report-period";

/** Stands for "no value": the parameter is left out and the server decides. */
const ANY = "__any";

type Item = { value: string; label: string };

const DEFAULT_PERIOD_LABELS = {
  last_7_days: "Last 7 days",
  enrollment: "Whole Enrollment",
  none: "All dates",
} as const;

/** Reports that are about one Student; staff must pick one. */
const STUDENT_REPORTS = new Set([
  "student-attendance",
  "fee-statement",
  "test-results",
  "monthly-student",
]);
/** Reports that are about one Batch; staff must pick one. */
const BATCH_REPORTS = new Set(["attendance-register", "batch-tests"]);

/** Which document filter shows a flag's value when the URL doesn't set it. */
const FLAG_CHIPS = {
  includeEnded: "Ended Enrol",
  includeClosed: "Closed Batches",
} as const;

function FilterSelect({
  id,
  label,
  items,
  value,
  placeholder,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  items: Item[];
  value: string | null;
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        items={items}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (next == null) return;
          onChange(next);
        }}
      >
        <SelectTrigger id={id} size="lg" className="w-full min-w-0">
          <SelectValue placeholder={placeholder} />
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

function optionList(
  options: ReportOptionsResponse,
  filter: ReportFilter,
): { list: ReportOption[]; all: string } | null {
  switch (filter) {
    case "batch":
      return { list: options.batches, all: "All Batches" };
    case "course":
      return { list: options.courses, all: "All Courses" };
    case "teacher":
      return { list: options.teachers, all: "All Teachers" };
    case "source":
      return { list: options.sources, all: "All sources" };
    case "recordedBy":
      return { list: options.recorders, all: "Anyone" };
    case "addedBy":
      return { list: options.staff, all: "Anyone" };
    default:
      return null;
  }
}

/**
 * The filter bar for one report, built from the filters the role may pick.
 * Only what the viewer picks goes into `params`; the rest is the server's
 * default.
 */
export function ReportFilters({
  item,
  options,
  role,
  params,
  documentFilters,
  shownPeriod,
  onChange,
}: {
  item: ReportCatalogueItem;
  options: ReportOptionsResponse;
  role: ReportRole;
  params: ReportParams;
  /** The filters of the report on screen, for the defaults of on/off filters. */
  documentFilters: { label: string; value: string }[];
  /** The period on screen, to start a custom range from. */
  shownPeriod: { from: string; to: string } | null;
  onChange: (params: ReportParams) => void;
}) {
  const staff = role === "owner" || role === "teacher";
  const family = !staff;
  const set = (name: ReportParamName, value: string | null) => {
    onChange(withReportParam(params, name, value === ANY ? null : value));
  };
  const effectiveStudentId =
    params.studentId ?? (family ? options.students[0]?.value : undefined);

  const controls = item.filters.map((filter) => {
    const id = `report-filter-${filter}`;
    const label = REPORT_FILTER_LABELS[filter];
    const param = REPORT_FILTER_PARAMS[filter];

    switch (filter) {
      case "period": {
        const presetDefault = (
          REPORT_PERIOD_PRESETS as readonly string[]
        ).includes(item.defaultPeriod);
        const defaultValue = presetDefault ? item.defaultPeriod : ANY;
        const items: Item[] = [
          ...(presetDefault
            ? []
            : [
                {
                  value: ANY,
                  label:
                    DEFAULT_PERIOD_LABELS[
                      item.defaultPeriod as keyof typeof DEFAULT_PERIOD_LABELS
                    ],
                },
              ]),
          ...REPORT_PERIOD_PRESETS.map((preset) => ({
            value: preset,
            label: REPORT_PERIOD_LABELS[preset],
          })),
        ];
        const custom = params.period === "custom";
        return (
          <div key={filter} className="contents">
            <FilterSelect
              id={id}
              label={label}
              items={items}
              value={params.period ?? defaultValue}
              onChange={(value) => {
                let next = withReportParam(params, "from", null);
                next = withReportParam(next, "to", null);
                if (value === defaultValue || value === ANY) {
                  onChange(withReportParam(next, "period", null));
                  return;
                }
                next = withReportParam(next, "period", value);
                if (value === "custom" && shownPeriod != null) {
                  next = withReportParam(next, "from", shownPeriod.from);
                  next = withReportParam(next, "to", shownPeriod.to);
                }
                onChange(next);
              }}
            />
            {custom ? (
              <>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="report-filter-from">From</Label>
                  <Input
                    id="report-filter-from"
                    type="date"
                    className="h-10"
                    value={params.from ?? ""}
                    max={params.to}
                    onChange={(event) => {
                      set("from", event.target.value);
                    }}
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="report-filter-to">To</Label>
                  <Input
                    id="report-filter-to"
                    type="date"
                    className="h-10"
                    value={params.to ?? ""}
                    min={params.from}
                    onChange={(event) => {
                      set("to", event.target.value);
                    }}
                  />
                </div>
              </>
            ) : null}
          </div>
        );
      }
      case "month": {
        const current = options.today.slice(0, 7);
        const months = Array.from({ length: 12 }, (_, index) =>
          shiftMonth(current, index),
        );
        if (params.month != null && !months.includes(params.month))
          months.push(params.month);
        months.sort().reverse();
        return (
          <FilterSelect
            key={filter}
            id={id}
            label={label}
            items={months.map((month) => ({
              value: month,
              label: formatMonth(month),
            }))}
            value={params.month ?? current}
            onChange={(value) => {
              set("month", value === current ? null : value);
            }}
          />
        );
      }
      case "student": {
        const required = staff && STUDENT_REPORTS.has(item.key);
        const items: Item[] = [
          ...(staff && !required
            ? [{ value: ANY, label: "All Students" }]
            : []),
          ...options.students,
        ];
        return (
          <FilterSelect
            key={filter}
            id={id}
            label={label}
            items={items}
            value={
              params.studentId ??
              (family
                ? (options.students[0]?.value ?? null)
                : required
                  ? null
                  : ANY)
            }
            placeholder="Choose a Student"
            onChange={(value) => {
              let next = withReportParam(
                params,
                "studentId",
                value === ANY ? null : value,
              );
              const enrollment = options.enrollments.find(
                (option) => option.value === params.enrollmentId,
              );
              if (enrollment != null && enrollment.studentId !== value)
                next = withReportParam(next, "enrollmentId", null);
              // R18 is one Student or a whole Batch, never both.
              if (item.key === "monthly-student" && value !== ANY)
                next = withReportParam(next, "batchId", null);
              onChange(next);
            }}
          />
        );
      }
      case "enrollment": {
        const list = options.enrollments.filter(
          (option) => option.studentId === effectiveStudentId,
        );
        return (
          <FilterSelect
            key={filter}
            id={id}
            label={label}
            items={[{ value: ANY, label: "All Enrollments" }, ...list]}
            value={params.enrollmentId ?? ANY}
            disabled={effectiveStudentId == null}
            onChange={(value) => {
              set("enrollmentId", value);
            }}
          />
        );
      }
      case "includeEnded":
      case "includeClosed": {
        const chip = documentFilters.find((entry) =>
          entry.label.startsWith(FLAG_CHIPS[filter]),
        );
        const checked =
          params[param] != null
            ? params[param] === "true"
            : chip?.value === "Included";
        return (
          <div
            key={filter}
            className="flex min-w-0 items-center gap-2 self-end pb-2.5"
          >
            <Switch
              id={id}
              checked={checked}
              onCheckedChange={(next) => {
                set(param, next ? "true" : "false");
              }}
            />
            <Label htmlFor={id} className="font-normal">
              {label}
            </Label>
          </div>
        );
      }
      case "sort": {
        const first = item.sorts[0]?.value;
        if (first == null) return null;
        return (
          <FilterSelect
            key={filter}
            id={id}
            label={label}
            items={item.sorts}
            value={params.sort ?? first}
            onChange={(value) => {
              set("sort", value === first ? null : value);
            }}
          />
        );
      }
      case "dueFilter": {
        const items = REPORT_ENUM_FILTER_ITEMS.dueFilter ?? [];
        return (
          <FilterSelect
            key={filter}
            id={id}
            label={label}
            items={items}
            value={params.dueFilter ?? "all"}
            onChange={(value) => {
              set("dueFilter", value === "all" ? null : value);
            }}
          />
        );
      }
      default: {
        const choices = optionList(options, filter);
        if (choices != null) {
          const required =
            staff && filter === "batch" && BATCH_REPORTS.has(item.key);
          const monthly = filter === "batch" && item.key === "monthly-student";
          const items: Item[] = [
            ...(required || monthly
              ? []
              : [{ value: ANY, label: choices.all }]),
            ...choices.list,
          ];
          return (
            <FilterSelect
              key={filter}
              id={id}
              label={monthly ? "Or a whole Batch" : label}
              items={items}
              value={params[param] ?? (required || monthly ? null : ANY)}
              placeholder="Choose a Batch"
              onChange={(value) => {
                let next = withReportParam(
                  params,
                  param,
                  value === ANY ? null : value,
                );
                if (monthly) next = withReportParam(next, "studentId", null);
                onChange(next);
              }}
            />
          );
        }
        const enumItems = REPORT_ENUM_FILTER_ITEMS[filter] ?? [];
        return (
          <FilterSelect
            key={filter}
            id={id}
            label={label}
            items={[{ value: ANY, label: "Any" }, ...enumItems]}
            value={params[param] ?? ANY}
            onChange={(value) => {
              set(param, value);
            }}
          />
        );
      }
    }
  });

  if (item.filters.length === 0) return null;

  return (
    <section
      aria-label="Report filters"
      className="bg-card space-y-3 rounded-2xl border p-4 shadow-sm sm:p-5 print:hidden"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {controls}
      </div>
      {Object.keys(params).length === 0 ? null : (
        <Button
          type="button"
          variant="link"
          className="h-auto p-0"
          onClick={() => {
            onChange({});
          }}
        >
          Clear filters
        </Button>
      )}
    </section>
  );
}
