"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Paperclip } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Progress } from "@repo/ui/components/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { formatBytes } from "@/lib/project-documents";
import { acceptOf, checkUploadFile } from "@/lib/project-uploads";
import { fieldForCode } from "@/lib/server-errors";
import { isUploadCancelled } from "@/src/queries/direct-upload";
import {
  useSaveTestingReport,
  type TestingReport,
} from "@/src/queries/project-testing-reports";

import { DocumentFileIcon } from "../documents/document-file-icon";

const NAME_MAX = 120;
const REMARK_MAX = 500;

/** Today on this device, `YYYY-MM-DD`. */
function deviceToday(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function schemaFor(adding: boolean) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, "Enter the report name.")
      .max(
        NAME_MAX,
        `The report name can be at most ${String(NAME_MAX)} characters.`,
      ),
    reportDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the report date."),
    remark: z
      .string()
      .max(
        REMARK_MAX,
        `The remark can be at most ${String(REMARK_MAX)} characters.`,
      ),
    file: z.custom<File | null>().superRefine((file, context) => {
      if (file == null) {
        if (adding)
          context.addIssue({
            code: "custom",
            message: "Choose the report file.",
          });
        return;
      }
      const problem = checkUploadFile("testing_report", file);
      if (problem != null)
        context.addIssue({ code: "custom", message: problem.message });
    }),
  });
}

type Values = z.infer<ReturnType<typeof schemaFor>>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  TESTING_REPORT_NAME_REQUIRED: "name",
  TESTING_REPORT_NAME_TOO_LONG: "name",
  TESTING_REPORT_DATE_INVALID: "reportDate",
  BACKDATED_CREATE_BLOCKED: "reportDate",
  BACKDATED_EDIT_BLOCKED: "reportDate",
  FINANCIAL_PERIOD_CLOSED: "reportDate",
  TESTING_REPORT_REMARK_TOO_LONG: "remark",
  FILE_REQUIRED: "file",
  FILE_TYPE_NOT_ALLOWED: "file",
  FILE_TOO_LARGE: "file",
  FILE_EMPTY: "file",
};

function ReportForm({
  projectId,
  itemId,
  report,
  today,
  onDone,
}: {
  projectId: string;
  itemId: string;
  report: TestingReport | null;
  today: string;
  onDone: () => void;
}) {
  const adding = report == null;
  const save = useSaveTestingReport(projectId, itemId);
  const picker = useRef<HTMLInputElement>(null);
  const running = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schemaFor(adding)),
    defaultValues: {
      name: report?.name ?? "",
      reportDate: report?.reportDate ?? today,
      remark: report?.remark ?? "",
      file: null,
    },
  });
  const errors = form.formState.errors;
  const remark = useWatch({ control: form.control, name: "remark" });
  const file = useWatch({ control: form.control, name: "file" });

  // Closing the sheet cancels an upload still going.
  useEffect(
    () => () => {
      running.current?.abort();
    },
    [],
  );

  const submit = async (values: Values) => {
    const controller = new AbortController();
    running.current = controller;
    setProgress(values.file == null ? null : 0);
    try {
      await save.mutateAsync({
        reportId: report?.id,
        updatedAt: report?.updatedAt,
        details: {
          name: values.name,
          reportDate: values.reportDate,
          remark: values.remark.trim().length === 0 ? null : values.remark,
        },
        file: values.file,
        signal: controller.signal,
        onProgress: setProgress,
      });
      onDone();
    } catch (error) {
      if (isUploadCancelled(error)) return;
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    } finally {
      running.current = null;
      setProgress(null);
    }
  };

  const fileName = file?.name ?? report?.fileName;

  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit(submit)(event);
      }}
    >
      <SheetHeader>
        <SheetTitle>{adding ? "Add report" : "Edit report"}</SheetTitle>
        <SheetDescription>
          One PDF or image of the lab report, up to 25 MB.
        </SheetDescription>
      </SheetHeader>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
        <div className="space-y-1.5">
          <Label htmlFor="testing-report-name">Name</Label>
          <Input
            id="testing-report-name"
            className="h-10"
            autoComplete="off"
            placeholder="Cube test – pour 12"
            aria-invalid={errors.name != null}
            {...form.register("name")}
          />
          <FieldError message={errors.name?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="testing-report-date">Report date</Label>
          <Input
            id="testing-report-date"
            type="date"
            className="h-10"
            aria-invalid={errors.reportDate != null}
            {...form.register("reportDate")}
          />
          <FieldError message={errors.reportDate?.message} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="testing-report-remark">
              Remark <span className="text-muted-foreground">(optional)</span>
            </Label>
            <span
              aria-live="polite"
              className="text-muted-foreground text-xs tabular-nums"
            >
              {String(remark.length)}/{String(REMARK_MAX)}
            </span>
          </div>
          <Textarea
            id="testing-report-remark"
            rows={3}
            placeholder="Result, lab, anything to remember"
            aria-invalid={errors.remark != null}
            {...form.register("remark")}
          />
          <FieldError message={errors.remark?.message} />
        </div>
        <div className="space-y-1.5">
          <span id="testing-report-file" className="text-sm font-medium">
            File
          </span>
          <Controller
            name="file"
            control={form.control}
            render={({ field }) => (
              <Input
                ref={picker}
                type="file"
                accept={acceptOf("testing_report")}
                aria-label="Report file"
                className="sr-only"
                tabIndex={-1}
                onChange={(event) => {
                  const chosen = event.target.files?.[0] ?? null;
                  event.target.value = "";
                  if (chosen == null) return;
                  field.onChange(chosen);
                  void form.trigger("file");
                }}
              />
            )}
          />
          <div
            aria-labelledby="testing-report-file"
            role="group"
            className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5"
          >
            {fileName == null ? (
              <p className="text-muted-foreground min-w-0 flex-1 text-sm">
                No file chosen
              </p>
            ) : (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <DocumentFileIcon
                  fileName={fileName}
                  contentType={file == null ? report?.contentType : undefined}
                  className="text-muted-foreground size-4 shrink-0"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm" title={fileName}>
                    {fileName}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {file == null ? "Current file" : formatBytes(file.size)}
                  </p>
                </div>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={save.isPending}
              onClick={() => picker.current?.click()}
            >
              <Paperclip aria-hidden="true" />
              {!adding
                ? "Replace file"
                : file == null
                  ? "Choose file"
                  : "Choose another"}
            </Button>
          </div>
          <FieldError message={errors.file?.message} />
          {progress == null ? null : (
            <div className="space-y-1">
              <Progress
                value={progress}
                aria-label={`Uploading ${fileName ?? "file"}`}
              />
              <p className="text-muted-foreground text-xs tabular-nums">
                {progress >= 100 ? "Saving…" : `${String(progress)}%`}
              </p>
            </div>
          )}
        </div>
        <FormAlert message={errors.root?.message} />
      </div>
      <SheetFooter className="flex-row justify-end border-t">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : adding ? "Add report" : "Save"}
        </Button>
      </SheetFooter>
    </form>
  );
}

/**
 * Add a Testing Report to a testing material, or edit one: name, report
 * date (today to start; the Back-dated Entry policy may refuse older
 * dates), an optional remark and one PDF or image. Editing keeps the file
 * unless another is chosen. The bar shows the file going up.
 */
export function TestingReportSheet({
  projectId,
  itemId,
  open,
  report,
  today,
  onClose,
}: {
  projectId: string;
  itemId: string;
  open: boolean;
  /** The report to edit; null to add one. */
  report: TestingReport | null;
  /** `YYYY-MM-DD`; defaults to today on this device. */
  today?: string;
  onClose: () => void;
}) {
  // Keep the form on screen while the sheet slides closed.
  const [last, setLast] = useState(report);
  if (open && report !== last) setLast(report);
  const shown = open ? report : last;
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <ReportForm
          key={shown?.id ?? "new"}
          projectId={projectId}
          itemId={itemId}
          report={shown}
          today={today ?? deviceToday()}
          onDone={onClose}
        />
      </SheetContent>
    </Sheet>
  );
}
