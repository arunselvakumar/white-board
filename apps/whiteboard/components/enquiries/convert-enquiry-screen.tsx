"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { PageHeader } from "@/components/app-shell/page-header";
import {
  DEFAULT_TIMING_SLOT,
  refineStudentTimings,
  TIMING_SOURCE_ITEMS,
  timingSlotSchema,
  TimingSlotsEditor,
} from "@/components/enrollments/student-timings-fields";
import { applyHttpFormError } from "@/lib/apply-http-form-error";
import { CLASS_MODE_ITEMS, classModeLabel } from "@/lib/class-mode";
import {
  convertEnquiry,
  enquiryQueries,
  type ClassModeValue,
  type EnquiryDetailResponse,
  type EnquiryOptionsResponse,
} from "@/src/queries/enquiries";
import { QueryHttpError } from "@/src/queries/http";
import { invalidateRegisterQueries } from "@/src/queries/invalidate-register";

type ConvertBatch = EnquiryOptionsResponse["batches"][number];

const convertFormSchema = z
  .object({
    batchId: z.string().min(1, "Choose a Batch"),
    classModeOverride: z.enum(["inherit", "offline", "online", "hybrid"]),
    timingSource: z.enum(["batch", "student"]),
    timings: z.array(timingSlotSchema),
  })
  .superRefine(refineStudentTimings);

type ConvertFormValues = z.infer<typeof convertFormSchema>;

/** Conversion refusals that are about the chosen Batch, shown beside it. */
const BATCH_ERROR_CODES = new Set([
  "BATCH_AT_CAPACITY",
  "BATCH_CLOSED",
  "BATCH_NOT_FOUND",
  "COURSE_ARCHIVED",
]);

/** The Enquiry changed under us (converted or closed elsewhere): reload it. */
const STALE_ENQUIRY_CODES = new Set([
  "ENQUIRY_ALREADY_CONVERTED",
  "ENQUIRY_CLOSED",
]);

export function ConvertEnquiryScreen({ enquiryId }: { enquiryId: string }) {
  const { data: enquiry } = useSuspenseQuery(enquiryQueries.detail(enquiryId));
  const { data: options } = useSuspenseQuery(enquiryQueries.options());
  const back = {
    label: enquiry.prospectName,
    href: `/enquiries/${enquiry.id}`,
  };

  return (
    <div className="w-full p-6">
      <div className="flex w-full max-w-4xl flex-col gap-6">
        <PageHeader
          back={back}
          title="Convert to Student"
          meta={enquiry.courseName ?? enquiry.subject ?? "Admit this prospect"}
        />
        {enquiry.convertedStudentId != null ? (
          <ConvertNotice title={`${enquiry.prospectName} has joined`}>
            This Enquiry is already a Student.{" "}
            <Link
              className="text-foreground font-medium underline underline-offset-3"
              href={`/students/${enquiry.convertedStudentId}`}
            >
              Open {enquiry.prospectName}
            </Link>
          </ConvertNotice>
        ) : enquiry.stage === "not_interested" ? (
          <ConvertNotice title="This Enquiry is closed as Not interested">
            Reopen it first, then convert it to a Student.{" "}
            <Link
              className="text-foreground font-medium underline underline-offset-3"
              href={back.href}
            >
              Back to the Enquiry
            </Link>
          </ConvertNotice>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <ConvertEnquiryForm enquiry={enquiry} options={options} />
            <CarryOverCard enquiry={enquiry} />
          </div>
        )}
      </div>
    </div>
  );
}

function ConvertNotice({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      role="status"
      className="bg-card space-y-1 rounded-xl border p-5 shadow-sm"
    >
      <h2 className="font-semibold">{title}</h2>
      <p className="text-muted-foreground text-sm">{children}</p>
    </section>
  );
}

function CarryOverCard({ enquiry }: { enquiry: EnquiryDetailResponse }) {
  const rows: { label: string; value: string | null }[] = [
    { label: "Name", value: enquiry.prospectName },
    { label: "Phone", value: enquiry.phone },
    { label: "Email", value: enquiry.email },
    { label: "Parent or Guardian", value: enquiry.guardianName },
    { label: "Parent or Guardian phone", value: enquiry.guardianPhone },
  ];
  return (
    <aside
      aria-labelledby="carry-over-heading"
      className="bg-card h-fit space-y-4 rounded-xl border p-5 shadow-sm"
    >
      <div className="space-y-1">
        <h2 id="carry-over-heading" className="font-semibold">
          The new Student gets
        </h2>
        <p className="text-muted-foreground text-xs">
          Copied from this Enquiry.
        </p>
      </div>
      <dl className="grid gap-3 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-0.5">
            <dt className="text-muted-foreground text-xs">{row.label}</dt>
            <dd className={row.value == null ? "text-muted-foreground" : ""}>
              {row.value ?? "Not given"}
            </dd>
          </div>
        ))}
      </dl>
      <div className="text-muted-foreground space-y-2 border-t pt-4 text-xs">
        <p>
          The Course’s default fee becomes the Fee Plan. You can adjust it on
          the Enrollment afterwards.
        </p>
        {enquiry.email == null ? null : (
          <p>An invitation to Whiteboard goes to {enquiry.email}.</p>
        )}
      </div>
    </aside>
  );
}

/** Latest attended Batch demo, else the only open Batch of the Enquiry's Course. */
export function defaultConvertBatchId(
  enquiry: EnquiryDetailResponse,
  batches: ConvertBatch[],
): string {
  const openBatchIds = new Set(batches.map((batch) => batch.id));
  const attended = enquiry.demos
    .filter(
      (demo) =>
        demo.kind === "batch" &&
        demo.attendance === "attended" &&
        demo.cancelledAt == null &&
        demo.batchId != null &&
        openBatchIds.has(demo.batchId),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime),
    )[0];
  if (attended?.batchId != null) return attended.batchId;
  if (enquiry.courseId == null) return "";
  const courseBatches = batches.filter(
    (batch) => batch.courseId === enquiry.courseId,
  );
  return courseBatches.length === 1 ? (courseBatches[0]?.id ?? "") : "";
}

function defaultModeFor(
  preferred: ClassModeValue | null,
  batch: ConvertBatch | undefined,
): ConvertFormValues["classModeOverride"] {
  if (preferred == null || batch == null) return "inherit";
  return preferred === batch.classMode ? "inherit" : preferred;
}

function isFull(batch: ConvertBatch): boolean {
  return batch.enrolled >= batch.capacity;
}

function ConvertEnquiryForm({
  enquiry,
  options,
}: {
  enquiry: EnquiryDetailResponse;
  options: EnquiryOptionsResponse;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const batches = [...options.batches].sort(
    (a, b) =>
      Number(b.courseId === enquiry.courseId) -
        Number(a.courseId === enquiry.courseId) || a.name.localeCompare(b.name),
  );
  const initialBatchId = defaultConvertBatchId(enquiry, batches);
  const {
    control,
    handleSubmit,
    setError,
    setValue,
    getFieldState,
    formState: { errors, isSubmitting },
  } = useForm<ConvertFormValues>({
    resolver: zodResolver(convertFormSchema),
    defaultValues: {
      batchId: initialBatchId,
      classModeOverride: defaultModeFor(
        enquiry.preferredClassMode,
        batches.find((batch) => batch.id === initialBatchId),
      ),
      timingSource: "batch",
      timings: [DEFAULT_TIMING_SLOT],
    },
  });
  const batchId = useWatch({ control, name: "batchId" });
  const timingSource = useWatch({ control, name: "timingSource" });
  const selectedBatch = batches.find((batch) => batch.id === batchId);

  const convert = useMutation({
    mutationFn: (values: ConvertFormValues) =>
      convertEnquiry(enquiry.id, {
        batchId: values.batchId,
        timingSource: values.timingSource,
        studentTimings:
          values.timingSource === "student"
            ? values.timings.map((slot) => ({
                daysOfWeek: [...slot.daysOfWeek],
                startTime: slot.startTime,
                endTime: slot.endTime,
              }))
            : undefined,
        classModeOverride:
          values.classModeOverride === "inherit"
            ? null
            : values.classModeOverride,
      }),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: enquiryQueries.key.all }),
        invalidateRegisterQueries(queryClient),
      ]);
      router.push(`/students/${result.studentId}`);
    },
  });

  const batchItems = batches.map((batch) => ({
    value: batch.id,
    label: `${batch.name} · ${batch.courseName}`,
  }));
  const modeItems = [
    {
      value: "inherit",
      label:
        selectedBatch == null
          ? "Use Batch mode"
          : `Use Batch mode (${classModeLabel(selectedBatch.classMode)})`,
    },
    ...CLASS_MODE_ITEMS,
  ];

  return (
    <form
      noValidate
      aria-label="Convert to Student"
      className="space-y-5"
      onSubmit={handleSubmit(async (values) => {
        try {
          await convert.mutateAsync(values);
        } catch (error) {
          if (error instanceof QueryHttpError) {
            if (BATCH_ERROR_CODES.has(error.code)) {
              setError("batchId", { message: error.message });
              return;
            }
            if (STALE_ENQUIRY_CODES.has(error.code)) {
              await queryClient.invalidateQueries({
                queryKey: enquiryQueries.key.detail(enquiry.id),
              });
            }
          }
          applyHttpFormError(
            error,
            setError,
            "Could not convert this Enquiry. Please try again.",
          );
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <div className="space-y-1.5">
        <Label htmlFor="convert-batch">Batch</Label>
        <Controller
          name="batchId"
          control={control}
          render={({ field }) => (
            <Select
              items={batchItems}
              value={field.value.length === 0 ? null : field.value}
              onValueChange={(value) => {
                if (value == null) return;
                field.onChange(value);
                if (!getFieldState("classModeOverride").isDirty) {
                  setValue(
                    "classModeOverride",
                    defaultModeFor(
                      enquiry.preferredClassMode,
                      batches.find((batch) => batch.id === value),
                    ),
                  );
                }
              }}
            >
              <SelectTrigger
                id="convert-batch"
                size="lg"
                className="w-full min-w-0"
                aria-invalid={errors.batchId != null}
              >
                <SelectValue placeholder="Select a Batch" />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                {batches.map((batch) => (
                  <SelectItem key={batch.id} value={batch.id}>
                    <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                      <span className="min-w-0 truncate">
                        {batch.name}
                        <span className="text-muted-foreground">
                          {" "}
                          · {batch.courseName}
                        </span>
                      </span>
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {batch.enrolled}/{batch.capacity}
                        {isFull(batch) ? " · Full" : ""}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {batches.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No open Batches. <Link href="/batches/new">Add a Batch</Link> first.
          </p>
        ) : selectedBatch == null ? null : (
          <p className="text-muted-foreground text-sm">
            {selectedBatch.enrolled} of {selectedBatch.capacity} seats taken
            {isFull(selectedBatch) ? " — this Batch is full" : ""} ·{" "}
            {classModeLabel(selectedBatch.classMode)}
          </p>
        )}
        <FieldError message={errors.batchId?.message} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="convert-timing-source">Timings</Label>
          <Controller
            name="timingSource"
            control={control}
            render={({ field }) => (
              <Select
                items={[...TIMING_SOURCE_ITEMS]}
                value={field.value}
                onValueChange={(value) => {
                  if (value == null) return;
                  field.onChange(value);
                }}
              >
                <SelectTrigger
                  id="convert-timing-source"
                  size="lg"
                  className="w-full min-w-0"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {TIMING_SOURCE_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="convert-class-mode">Class Mode</Label>
          <Controller
            name="classModeOverride"
            control={control}
            render={({ field }) => (
              <Select
                items={modeItems}
                value={field.value}
                onValueChange={(value) => {
                  if (value == null) return;
                  field.onChange(value);
                }}
              >
                <SelectTrigger
                  id="convert-class-mode"
                  size="lg"
                  className="w-full min-w-0"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {modeItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {enquiry.preferredClassMode == null ? null : (
            <p className="text-muted-foreground text-xs">
              Prefers {classModeLabel(enquiry.preferredClassMode)}.
            </p>
          )}
        </div>
      </div>
      {enquiry.preferredTiming == null ? null : (
        <p className="text-muted-foreground text-sm">
          Preferred timing: {enquiry.preferredTiming}
        </p>
      )}
      {timingSource === "student" ? (
        <Controller
          name="timings"
          control={control}
          render={({ field }) => (
            <TimingSlotsEditor
              idPrefix="convert-slot"
              value={field.value}
              onChange={field.onChange}
              errors={field.value.map((_, index) => ({
                daysOfWeek: errors.timings?.[index]?.daysOfWeek?.message,
                endTime: errors.timings?.[index]?.endTime?.message,
              }))}
            />
          )}
        />
      ) : null}
      <FieldError message={errors.timings?.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting || batches.length === 0}>
          Convert to Student
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            router.push(`/enquiries/${enquiry.id}`);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
