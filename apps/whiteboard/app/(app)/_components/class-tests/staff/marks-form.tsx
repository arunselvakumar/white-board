"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { EyeOff, History, Send } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Controller,
  useForm,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
  type UseFormGetValues,
} from "react-hook-form";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import {
  DRAFT_VISIBILITY_NOTE,
  PUBLISH_CONFIRMATION,
  RESULT_STATUS_LABEL,
  passText,
  resultText,
} from "@/components/class-tests/result-format";
import {
  TEST_REMARK_MAX,
  classTestQueries,
  publishClassTest,
  saveTestResults,
  type ClassTestDetailView,
  type TestResultChangeView,
  type TestResultInput,
  type TestResultStatus,
  type TestRosterRowView,
} from "@/src/queries/class-tests";
import { QueryHttpError } from "@/src/queries/http";

import {
  errorCode,
  errorMessage,
  nameList,
  parseMarks,
  postedByLabel,
  timestampLabel,
} from "./test-staff-format";

const STATUSES: TestResultStatus[] = ["scored", "absent", "exempt"];

function isStatus(value: unknown): value is TestResultStatus {
  return value === "scored" || value === "absent" || value === "exempt";
}

const rowSchema = z.object({
  status: z.enum(["", "scored", "absent", "exempt"]),
  marks: z.string(),
  remark: z.string(),
});

const valuesSchema = z.object({ rows: z.array(rowSchema) });

type RowValues = z.infer<typeof rowSchema>;
type Values = z.infer<typeof valuesSchema>;

/** Client checks that mirror the server's; the server's message wins. */
function marksSchema({
  names,
  maxMarks,
  published,
}: {
  names: readonly string[];
  maxMarks: number;
  published: boolean;
}) {
  return valuesSchema.superRefine((value, ctx) => {
    value.rows.forEach((row, index) => {
      const name = names[index] ?? "this Student";
      const remark = row.remark.trim();
      if (remark.length > TEST_REMARK_MAX)
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "remark"],
          message: `Remark for ${name} must be ${String(TEST_REMARK_MAX)} characters or fewer.`,
        });
      if (row.status === "") {
        if (published)
          ctx.addIssue({
            code: "custom",
            path: ["rows", index, "status"],
            message: `Published results can’t be left blank. Mark ${name} absent or exempt instead.`,
          });
        else if (remark !== "" || row.marks.trim() !== "")
          ctx.addIssue({
            code: "custom",
            path: ["rows", index, "status"],
            message: `Choose scored, absent, or exempt for ${name}.`,
          });
        return;
      }
      if (row.status !== "scored") return;
      const parsed = parseMarks(row.marks, maxMarks, name);
      if ("error" in parsed)
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "marks"],
          message: parsed.error,
        });
    });
  });
}

function rowValues(row: TestRosterRowView): RowValues {
  const { result } = row;
  if (result == null) return { status: "", marks: "", remark: "" };
  return {
    status: result.status,
    marks: result.marks == null ? "" : String(result.marks),
    remark: result.remark ?? "",
  };
}

function formValues(view: ClassTestDetailView): Values {
  return { rows: view.rows.map(rowValues) };
}

/**
 * The rows this page changed, each with the `updatedAt` it loaded, so a save
 * never sends (and overwrites) a row someone else changed meanwhile.
 */
function toInput(
  rows: readonly TestRosterRowView[],
  values: Values,
  changed: (index: number) => boolean,
): TestResultInput[] {
  return rows.flatMap((row, index): TestResultInput[] => {
    if (!changed(index)) return [];
    const value = values.rows[index] ?? { status: "", marks: "", remark: "" };
    const remark = value.remark.trim();
    const expectedUpdatedAt = row.result?.updatedAt ?? null;
    if (value.status === "")
      return [
        {
          studentId: row.student.id,
          status: null,
          marks: null,
          remark: null,
          expectedUpdatedAt,
        },
      ];
    return [
      {
        studentId: row.student.id,
        status: value.status,
        marks: value.status === "scored" ? Number(value.marks.trim()) : null,
        remark: remark === "" ? null : remark,
        expectedUpdatedAt,
      },
    ];
  });
}

/** The row a server error is about, from the Student id in its details. */
function rowInError(
  error: unknown,
  rows: readonly TestRosterRowView[],
): number | null {
  const details = error instanceof QueryHttpError ? error.details : null;
  const studentId =
    typeof details === "object" && details != null && "studentId" in details
      ? details.studentId
      : null;
  const index = rows.findIndex((row) => row.student.id === studentId);
  return index === -1 ? null : index;
}

/** Another User saved this Test after the page loaded. */
const STALE_CODE = "CLASS_TEST_RESULT_CHANGED";

const ROW_ERROR_FIELD: Record<string, "status" | "marks" | "remark"> = {
  [STALE_CODE]: "status",
  CLASS_TEST_MARKS_REQUIRED: "marks",
  CLASS_TEST_MARKS_OUT_OF_RANGE: "marks",
  CLASS_TEST_MARKS_STEP: "marks",
  CLASS_TEST_MARKS_NOT_ALLOWED: "marks",
  CLASS_TEST_REMARK_TOO_LONG: "remark",
  CLASS_TEST_RESULT_REQUIRED: "status",
  CLASS_TEST_STATUS_REQUIRED: "status",
};

export function MarksForm({
  view,
  studentBasePath,
}: {
  view: ClassTestDetailView;
  studentBasePath: string;
}) {
  const { test, batch, rows } = view;
  const published = test.publishedAt != null;
  const hasPassMark = test.passMarks != null;
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  // useForm reads its options on every render, so the rules follow the
  // latest Test details (the maximum can change).
  const resolver = zodResolver(
    marksSchema({
      names: rows.map((row) => row.student.name),
      maxMarks: test.maxMarks,
      published,
    }),
  );

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    getValues,
    reset,
    formState: { errors, isDirty, isSubmitting, dirtyFields },
  } = useForm<Values>({ resolver, defaultValues: formValues(view) });
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, [isDirty]);

  async function settle(next: ClassTestDetailView) {
    queryClient.setQueryData(classTestQueries.key.detail(test.id), next);
    reset(formValues(next));
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: classTestQueries.key.batch(batch.id),
      }),
      queryClient.invalidateQueries({
        queryKey: [...classTestQueries.key.all, "student"],
      }),
    ]);
  }

  /** Fetches the Test again and replaces this page's marks with it. */
  async function loadLatest() {
    const next = await queryClient.query({
      ...classTestQueries.detail(test.id),
      staleTime: 0,
    });
    setStale(false);
    await settle(next);
  }

  /** Saves the changed rows. Returns false and shows the server's message on failure. */
  async function save(values: Values): Promise<boolean> {
    let next: ClassTestDetailView;
    const changed = (index: number) => {
      const row = dirtyFields.rows?.[index];
      return row != null && Object.values(row).some(Boolean);
    };
    try {
      next = await saveTestResults(test.id, toInput(rows, values, changed));
    } catch (error) {
      const message = errorMessage(error);
      const code = errorCode(error);
      setStale(code === STALE_CODE);
      const field = ROW_ERROR_FIELD[code ?? ""];
      const index = field == null ? null : rowInError(error, rows);
      if (field != null && index != null)
        setError(
          `rows.${index}.${field}`,
          { message: "" },
          { shouldFocus: true },
        );
      setError("root", { message });
      return false;
    }
    setStale(false);
    await settle(next);
    return true;
  }

  function focusMarks(index: number) {
    const input = formRef.current?.querySelector<HTMLInputElement>(
      `[data-marks-row="${String(index)}"]`,
    );
    input?.focus();
    input?.select();
  }

  function focusRemark(index: number) {
    formRef.current
      ?.querySelector<HTMLInputElement>(`[data-remark-row="${String(index)}"]`)
      ?.focus();
  }

  const blankNames = () =>
    getValues("rows")
      .map((row, index) =>
        row.status === "" ? rows[index]?.student.name : null,
      )
      .filter((name): name is string => name != null);
  const [blankAtOpen, setBlankAtOpen] = useState<string[]>([]);

  const confirmPublish = handleSubmit(
    async (values) => {
      setPublishing(true);
      setPublishError(null);
      try {
        if (isDirty && !(await save(values))) {
          setPublishOpen(false);
          return;
        }
        let next: ClassTestDetailView;
        try {
          next = await publishClassTest(test.id);
        } catch (error) {
          setPublishError(errorMessage(error));
          return;
        }
        await settle(next);
        setPublishOpen(false);
      } finally {
        setPublishing(false);
      }
    },
    () => {
      setPublishOpen(false);
    },
  );

  const gridAreas = hasPassMark
    ? "[grid-template-areas:'name_pass''result_marks''remark_remark'] lg:[grid-template-areas:'name_result_marks_remark_pass']"
    : "[grid-template-areas:'name_name''result_marks''remark_remark'] lg:[grid-template-areas:'name_result_marks_remark']";
  const gridColumns = hasPassMark
    ? "grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_11.5rem_7rem_minmax(0,1.1fr)_3.5rem]"
    : "grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_11.5rem_7rem_minmax(0,1.1fr)]";
  const layout = `grid items-center gap-x-3 gap-y-2 ${gridColumns} ${gridAreas}`;

  return (
    <form
      ref={formRef}
      noValidate
      aria-label="Marks"
      className="space-y-3"
      onSubmit={handleSubmit(async (values) => {
        await save(values);
      })}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Marks</h2>
        <p className="text-muted-foreground hidden text-xs sm:block">
          Press Enter to move to the next Student.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-2xl border p-6 text-center text-sm">
          No Students are listed on this Test. Students whose Enrollment had
          begun by the Test date are listed.
        </p>
      ) : (
        <div className="bg-card rounded-2xl border shadow-sm">
          <div
            aria-hidden="true"
            className={`text-muted-foreground hidden border-b px-4 py-2 text-xs font-medium lg:grid ${layout}`}
          >
            <span className="[grid-area:name]">Student</span>
            <span className="[grid-area:result]">Result</span>
            <span className="[grid-area:marks]">Marks</span>
            <span className="[grid-area:remark]">Remark (optional)</span>
            {hasPassMark ? (
              <span className="[grid-area:pass]">Pass/Fail</span>
            ) : null}
          </div>
          <ul className="divide-y">
            {rows.map((row, index) => (
              <MarkRow
                key={row.student.id}
                index={index}
                row={row}
                layout={layout}
                control={control}
                register={register}
                setValue={setValue}
                getValues={getValues}
                errors={errors}
                maxMarks={test.maxMarks}
                passMarks={test.passMarks}
                published={published}
                timezone={batch.timezone}
                studentHref={`${studentBasePath}/${row.student.id}`}
                onMarksKey={(event) => {
                  if (event.key === "Enter" || event.key === "ArrowDown") {
                    event.preventDefault();
                    focusMarks(index + 1);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    focusMarks(index - 1);
                  }
                }}
                onRemarkKey={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    focusRemark(index + 1);
                  }
                }}
              />
            ))}
          </ul>
        </div>
      )}
      {rows.length === 0 ? null : (
        <div className="bg-card sticky bottom-4 z-10 space-y-3 rounded-2xl border p-4 shadow-sm">
          {published ? null : (
            <p className="flex items-start gap-2 text-sm font-medium">
              <EyeOff
                aria-hidden="true"
                className="text-muted-foreground mt-0.5 size-4 shrink-0"
              />
              {DRAFT_VISIBILITY_NOTE}
            </p>
          )}
          <FormAlert message={errors.root?.message} />
          {stale ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void loadLatest();
              }}
            >
              Load latest marks
            </Button>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-xs">
              {isDirty ? (
                <span className="text-foreground font-medium">
                  Unsaved changes
                </span>
              ) : (
                <span>All changes saved</span>
              )}
              {published ? null : (
                <>
                  {" · "}
                  <EnteredCount control={control} />
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                variant={published ? "default" : "outline"}
                disabled={isSubmitting || publishing || !isDirty}
              >
                {isSubmitting && !publishing
                  ? "Saving…"
                  : published
                    ? "Save changes"
                    : "Save draft"}
              </Button>
              {published ? null : (
                <Button
                  type="button"
                  disabled={isSubmitting || publishing}
                  onClick={() => {
                    setPublishError(null);
                    setBlankAtOpen(blankNames());
                    setPublishOpen(true);
                  }}
                >
                  <Send aria-hidden="true" />
                  Publish
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
      <AlertDialog
        open={publishOpen}
        onOpenChange={(open) => {
          if (!open && !publishing) setPublishOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish “{test.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {blankAtOpen.length > 0
                ? `Enter a result for ${nameList(blankAtOpen)} before publishing. Mark a Student absent or exempt if they didn’t take the Test.`
                : PUBLISH_CONFIRMATION}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {blankAtOpen.length > 0 ? null : (
            <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
              <li>A published Test can’t be deleted, and its date is fixed.</li>
              <li>You can still correct marks. Every change is logged.</li>
              {isDirty ? (
                <li className="text-foreground font-medium">
                  Your unsaved changes will be saved first.
                </li>
              ) : null}
            </ul>
          )}
          <FormAlert message={publishError ?? undefined} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishing}>
              {blankAtOpen.length > 0 ? "Back to marks" : "Not yet"}
            </AlertDialogCancel>
            {blankAtOpen.length > 0 ? null : (
              <Button
                type="button"
                disabled={publishing}
                onClick={() => {
                  void confirmPublish();
                }}
              >
                {publishing
                  ? "Publishing…"
                  : isDirty
                    ? "Save and publish"
                    : "Publish"}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

/** "12 of 20 entered", live as marks are typed. */
function EnteredCount({ control }: { control: Control<Values> }) {
  const rows = useWatch({ control, name: "rows" });
  const entered = rows.filter((row) => row.status !== "").length;
  return (
    <span>
      {entered} of {rows.length} entered
    </span>
  );
}

function MarkRow({
  index,
  row,
  layout,
  control,
  register,
  setValue,
  getValues,
  errors,
  maxMarks,
  passMarks,
  published,
  timezone,
  studentHref,
  onMarksKey,
  onRemarkKey,
}: {
  index: number;
  row: TestRosterRowView;
  layout: string;
  control: Control<Values>;
  register: UseFormRegister<Values>;
  setValue: UseFormSetValue<Values>;
  getValues: UseFormGetValues<Values>;
  errors: FieldErrors<Values>;
  maxMarks: number;
  passMarks: number | null;
  published: boolean;
  timezone: string;
  studentHref: string;
  onMarksKey: (event: KeyboardEvent<HTMLInputElement>) => void;
  onRemarkKey: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const name = row.student.name;
  const [showHistory, setShowHistory] = useState(false);
  const value = useWatch({ control, name: `rows.${index}` });
  const rowErrors = errors.rows?.[index];
  const scoredOrBlank = value.status === "scored" || value.status === "";
  const historyId = `test-history-${row.student.id}`;
  const parsed =
    value.status === "scored" ? parseMarks(value.marks, maxMarks, name) : null;
  const pass =
    passMarks == null || parsed == null || "error" in parsed
      ? null
      : passText(parsed.marks >= passMarks);
  const messages = [
    rowErrors?.status?.message,
    rowErrors?.marks?.message,
    rowErrors?.remark?.message,
  ].filter((message): message is string => message != null && message !== "");

  return (
    <li aria-label={name} className="px-4 py-3">
      <div className={layout}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 [grid-area:name]">
          <Link
            href={studentHref}
            className="truncate font-medium underline-offset-4 hover:underline"
          >
            {name}
          </Link>
          {row.history.length > 0 ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="text-muted-foreground h-auto gap-1 p-0 text-xs"
              aria-expanded={showHistory}
              aria-controls={historyId}
              onClick={() => {
                setShowHistory((open) => !open);
              }}
            >
              <History aria-hidden="true" />
              Changed
            </Button>
          ) : null}
        </div>
        <div className="[grid-area:result]">
          <Controller
            name={`rows.${index}.status`}
            control={control}
            render={({ field }) => (
              <ToggleGroup
                ref={field.ref}
                aria-label={`Result for ${name}`}
                aria-invalid={rowErrors?.status != null}
                variant="outline"
                size="sm"
                spacing={0}
                value={field.value === "" ? [] : [field.value]}
                onValueChange={(next: unknown[]) => {
                  const picked = next.find(isStatus);
                  if (picked == null) {
                    // Only a draft row may go back to blank.
                    if (published) return;
                    field.onChange("");
                    setValue(`rows.${index}.marks`, "", { shouldDirty: true });
                    return;
                  }
                  field.onChange(picked);
                  if (picked !== "scored")
                    setValue(`rows.${index}.marks`, "", { shouldDirty: true });
                }}
              >
                {STATUSES.map((status) => (
                  <ToggleGroupItem
                    key={status}
                    value={status}
                    className="aria-pressed:bg-primary aria-pressed:text-primary-foreground px-2"
                  >
                    {RESULT_STATUS_LABEL[status]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          />
        </div>
        <div className="flex items-center gap-1.5 [grid-area:marks]">
          <Input
            inputMode="decimal"
            autoComplete="off"
            className="h-8 w-16 text-right tabular-nums"
            placeholder={scoredOrBlank ? "–" : ""}
            aria-label={`Marks for ${name}`}
            aria-invalid={rowErrors?.marks != null}
            disabled={!scoredOrBlank}
            data-marks-row={index}
            onKeyDown={onMarksKey}
            {...register(`rows.${index}.marks`, {
              onChange: (event: { target: { value: string } }) => {
                if (
                  getValues(`rows.${index}.status`) === "" &&
                  event.target.value.trim() !== ""
                )
                  setValue(`rows.${index}.status`, "scored", {
                    shouldDirty: true,
                  });
              },
            })}
          />
          <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
            / {maxMarks}
          </span>
        </div>
        <div className="min-w-0 [grid-area:remark]">
          <Input
            autoComplete="off"
            className="h-8"
            maxLength={TEST_REMARK_MAX}
            placeholder="Remark"
            aria-label={`Remark for ${name}`}
            aria-invalid={rowErrors?.remark != null}
            data-remark-row={index}
            onKeyDown={onRemarkKey}
            {...register(`rows.${index}.remark`)}
          />
        </div>
        {passMarks == null ? null : (
          <div className="justify-self-end [grid-area:pass] lg:justify-self-start">
            {pass == null ? (
              <span className="text-muted-foreground text-xs">—</span>
            ) : (
              <Badge variant={pass === "Pass" ? "secondary" : "destructive"}>
                {pass}
              </Badge>
            )}
          </div>
        )}
      </div>
      {messages.map((message) => (
        <FieldError key={message} message={message} />
      ))}
      {showHistory ? (
        <ChangeHistory
          id={historyId}
          name={name}
          history={row.history}
          maxMarks={maxMarks}
          timezone={timezone}
        />
      ) : null}
    </li>
  );
}

function remarkText(remark: string | null): string {
  return remark == null ? "none" : `“${remark}”`;
}

function ChangeHistory({
  id,
  name,
  history,
  maxMarks,
  timezone,
}: {
  id: string;
  name: string;
  history: readonly TestResultChangeView[];
  maxMarks: number;
  timezone: string;
}) {
  return (
    <ol
      id={id}
      aria-label={`Changes to ${name}’s result`}
      className="bg-muted/40 mt-3 space-y-2 rounded-lg px-3 py-2 text-sm"
    >
      {history.map((change, index) => {
        const before = resultText(change.before, maxMarks);
        const after = resultText(change.after, maxMarks);
        const remarkChanged = change.before.remark !== change.after.remark;
        return (
          <li
            key={`${change.changedAt}-${String(index)}`}
            className="space-y-0.5"
          >
            {before === after ? null : (
              <p className="tabular-nums">
                {before} → {after}
              </p>
            )}
            {remarkChanged ? (
              <p className="break-words">
                Remark: {remarkText(change.before.remark)} →{" "}
                {remarkText(change.after.remark)}
              </p>
            ) : null}
            <p className="text-muted-foreground text-xs">
              {postedByLabel(change.changedBy)} ·{" "}
              {timestampLabel(change.changedAt, timezone)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
