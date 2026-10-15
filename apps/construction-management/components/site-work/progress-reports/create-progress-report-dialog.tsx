"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";

import { FieldError } from "@/components/auth/field-error";
import {
  progressReportFormOptionsQuery,
  type CreateProgressReportInput,
  type ProgressReportFormOptions,
} from "@/src/queries/progress-reports";

const EVERYONE = "everyone";

/** A Task Progress Report covers at most a year (CM-805). */
const MAX_DAYS = 366;

function dayNumber(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / 86_400_000;
}

function schemaFor(today: string) {
  const notAfterToday = (value: string) => value === "" || value <= today;
  return z
    .object({
      type: z.enum(["daily_progress_report", "task_progress_report"], {
        error: "Choose a report type.",
      }),
      date: z.string(),
      from: z.string(),
      to: z.string(),
      filledBy: z.string(),
      includeImages: z.boolean(),
    })
    .superRefine((values, context) => {
      const issue = (path: "date" | "from" | "to", message: string) => {
        context.addIssue({ code: "custom", path: [path], message });
      };
      if (values.type === "daily_progress_report") {
        if (values.date === "") issue("date", "Choose the date.");
        else if (!notAfterToday(values.date))
          issue("date", "Choose today or an earlier date.");
        return;
      }
      if (values.from === "") issue("from", "Choose the first day.");
      if (values.to === "") issue("to", "Choose the last day.");
      else if (!notAfterToday(values.to))
        issue("to", "Choose today or an earlier date.");
      if (values.from === "" || values.to === "") return;
      if (values.to < values.from)
        issue("to", "The period must end on or after the day it starts.");
      else if (dayNumber(values.to) - dayNumber(values.from) + 1 > MAX_DAYS)
        issue(
          "from",
          `A Task Progress Report covers at most ${String(MAX_DAYS)} days.`,
        );
    });
}
type Values = z.infer<ReturnType<typeof schemaFor>>;

function CreateForm({
  options,
  onSubmit,
  onCancel,
}: {
  options: ProgressReportFormOptions;
  onSubmit: (input: Omit<CreateProgressReportInput, "projectId">) => void;
  onCancel: () => void;
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schemaFor(options.today)),
    defaultValues: {
      type: "daily_progress_report",
      date: options.today,
      // The month so far, as the Reports page starts its periods.
      from: `${options.today.slice(0, 7)}-01`,
      to: options.today,
      filledBy: EVERYONE,
      includeImages: false,
    },
  });
  const errors = form.formState.errors;
  const type = useWatch({ control: form.control, name: "type" });
  const typeItems = options.types.map((type) => ({
    value: type.key,
    label: type.label,
  }));
  const memberItems = [
    { value: EVERYONE, label: "All Team Members" },
    ...options.teamMembers.map((member) => ({
      value: member.userId,
      label: member.name,
    })),
  ];

  return (
    <form
      noValidate
      aria-label="Create Progress Report"
      className="flex min-h-0 flex-1 flex-col gap-4"
      onSubmit={form.handleSubmit((values) => {
        if (values.type === "task_progress_report") {
          onSubmit({
            kind: "task_progress_report",
            from: values.from,
            to: values.to,
          });
          return;
        }
        onSubmit({
          date: values.date,
          filledBy: values.filledBy === EVERYONE ? null : values.filledBy,
          includeImages: values.includeImages,
        });
      })}
    >
      <div className="grid min-h-0 gap-4 overflow-y-auto sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="progress-report-type">Report type</Label>
          <Controller
            name="type"
            control={form.control}
            render={({ field }) => (
              <Select
                items={typeItems}
                value={field.value}
                onValueChange={(value) => {
                  if (
                    value === "daily_progress_report" ||
                    value === "task_progress_report"
                  )
                    field.onChange(value);
                }}
              >
                <SelectTrigger
                  id="progress-report-type"
                  className="w-full min-w-0"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {options.types.map((type) => (
                    <SelectItem
                      key={type.key}
                      value={type.key}
                      disabled={!type.available}
                    >
                      {type.label}
                      {type.note == null ? null : (
                        <span className="text-muted-foreground ml-2 text-xs">
                          {type.note}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError message={errors.type?.message} />
        </div>
        {type === "task_progress_report" ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="progress-report-from">From</Label>
              <Input
                id="progress-report-from"
                type="date"
                max={options.today}
                aria-invalid={errors.from != null}
                {...form.register("from")}
              />
              <FieldError message={errors.from?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="progress-report-to">To</Label>
              <Input
                id="progress-report-to"
                type="date"
                max={options.today}
                aria-invalid={errors.to != null}
                {...form.register("to")}
              />
              <FieldError message={errors.to?.message} />
            </div>
            <p className="text-muted-foreground text-xs sm:col-span-2">
              Each leaf task planned in the period or with progress in it,
              grouped by location: its progress at the start and at the end of
              the period and the work done, Daily Worksheets included.
            </p>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="progress-report-date">Date</Label>
              <Input
                id="progress-report-date"
                type="date"
                max={options.today}
                aria-invalid={errors.date != null}
                {...form.register("date")}
              />
              <FieldError message={errors.date?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="progress-report-filled-by">
                Report filled by
              </Label>
              <Controller
                name="filledBy"
                control={form.control}
                render={({ field }) => (
                  <Select
                    items={memberItems}
                    value={field.value}
                    onValueChange={(value) => {
                      if (value != null) field.onChange(value);
                    }}
                  >
                    <SelectTrigger
                      id="progress-report-filled-by"
                      className="w-full min-w-0"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      {memberItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-muted-foreground text-xs">
                Only this Team Member&apos;s worksheets and usage sheets are
                included.
              </p>
            </div>
            <Controller
              name="includeImages"
              control={form.control}
              render={({ field }) => (
                <Label className="flex items-start gap-3 font-normal sm:col-span-2">
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) => {
                      field.onChange(checked);
                    }}
                  />
                  <span className="space-y-0.5">
                    <span className="block">Include images in report</span>
                    <span className="text-muted-foreground block text-xs">
                      Photos of the day&apos;s worksheets, usage sheets and Site
                      Diary, at most 60.
                    </span>
                  </span>
                </Label>
              )}
            />
          </>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Generate</Button>
      </DialogFooter>
    </form>
  );
}

function LoadedForm({
  projectId,
  ...props
}: {
  projectId: string;
  onSubmit: (input: Omit<CreateProgressReportInput, "projectId">) => void;
  onCancel: () => void;
}) {
  const { data } = useSuspenseQuery(progressReportFormOptionsQuery(projectId));
  return <CreateForm options={data} {...props} />;
}

/**
 * **Create new** (CM-606, CM-805): Report type; for a Daily Progress
 * Report the Date (not after today), Report filled by (optional) and
 * Include images; for a Task Progress Report the period, From and To (To
 * not after today, at most a year).
 */
export function CreateProgressReportDialog({
  projectId,
  open,
  onOpenChange,
  onSubmit,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: Omit<CreateProgressReportInput, "projectId">) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Create Progress Report</DialogTitle>
          <DialogDescription>
            The Daily Progress Report prints a day&apos;s weather, labour,
            worksheets, equipment, materials, visitors, instructions and
            hindrances; the Task Progress Report each task&apos;s progress over
            a period. Each is one PDF.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <Suspense
            fallback={
              <div className="space-y-3" aria-busy="true">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            }
          >
            <LoadedForm
              projectId={projectId}
              onSubmit={onSubmit}
              onCancel={() => {
                onOpenChange(false);
              }}
            />
          </Suspense>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
