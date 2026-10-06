"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import {
  Controller,
  useForm,
  useWatch,
  type Control,
  type UseFormSetError,
} from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
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
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Spinner } from "@repo/ui/components/spinner";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { clockLabel } from "@/lib/class-changes";
import { parseRupeesInput } from "@/lib/money";
import { QueryHttpError } from "@/src/queries/http";
import {
  enquiryQueries,
  type BookDemoInput,
  type DemoSlot,
  type EnquiryOptionsResponse,
} from "@/src/queries/enquiries";

import { dayDate, todayInKolkata } from "./enquiry-format";

const MIN_FEE_PAISE = 100;
const MAX_FEE_PAISE = 10_000_000;
const CLOCK = /^\d{2}:\d{2}$/;

function bookDemoSchema(today: string) {
  return z
    .object({
      kind: z.enum(["batch", "one_to_one"]),
      batchId: z.string(),
      date: z.string(),
      slotStartTime: z.string(),
      teacherId: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      feeKind: z.enum(["free", "paid"]),
      amountRupees: z.string(),
    })
    .superRefine((values, ctx) => {
      const issue = (path: string, message: string) => {
        ctx.addIssue({ code: "custom", path: [path], message });
      };
      if (values.date === "") issue("date", "Choose a date");
      else if (values.date < today) issue("date", "Choose today or later");
      if (values.kind === "batch") {
        if (values.batchId === "")
          issue("batchId", "Pick a Batch for the demo");
        else if (values.date !== "" && values.slotStartTime === "")
          issue("slotStartTime", "Choose one of that day’s Classes");
      } else {
        if (values.teacherId === "") issue("teacherId", "Choose a Teacher");
        if (!CLOCK.test(values.startTime))
          issue("startTime", "Choose a start time");
        if (!CLOCK.test(values.endTime)) issue("endTime", "Choose an end time");
        else if (
          CLOCK.test(values.startTime) &&
          values.endTime <= values.startTime
        )
          issue("endTime", "End time must be after the start time");
      }
      if (values.feeKind === "paid") {
        const paise = parseRupeesInput(values.amountRupees);
        if (values.amountRupees.trim() === "")
          issue("amountRupees", "Enter the demo fee");
        else if (
          paise == null ||
          paise < MIN_FEE_PAISE ||
          paise > MAX_FEE_PAISE
        )
          issue("amountRupees", "Enter an amount from ₹1 to ₹1,00,000");
      }
    });
}

type BookDemoValues = z.infer<ReturnType<typeof bookDemoSchema>>;

const FIELD_BY_CODE: Record<string, keyof BookDemoValues> = {
  BATCH_NOT_FOUND: "batchId",
  BATCH_CLOSED: "batchId",
  DEMO_CLASS_UNAVAILABLE: "slotStartTime",
  DEMO_IN_PAST: "date",
  DEMO_ON_HOLIDAY: "date",
  TEACHER_NOT_FOUND: "teacherId",
  TEACHER_INACTIVE: "teacherId",
  DEMO_TEACHER_CLASH: "startTime",
  DEMO_TIME_INVALID: "endTime",
  DEMO_FEE_INVALID: "amountRupees",
};

function applyBookDemoError(
  error: unknown,
  values: BookDemoValues,
  setError: UseFormSetError<BookDemoValues>,
) {
  const fallback = "Could not book this demo. Please try again.";
  if (!(error instanceof QueryHttpError)) {
    setError("root", { message: fallback });
    return;
  }
  let field = FIELD_BY_CODE[error.code];
  if (field === "date" && values.kind === "batch" && values.slotStartTime) {
    field = "slotStartTime";
  }
  if (field != null) {
    setError(field, { message: error.message });
    return;
  }
  setError("root", { message: error.message || fallback });
}

export function bookDemoValuesToInput(values: BookDemoValues): BookDemoInput {
  const feeAmountPaise =
    values.feeKind === "paid" ? parseRupeesInput(values.amountRupees) : null;
  if (values.kind === "batch") {
    return {
      kind: "batch",
      batchId: values.batchId,
      date: values.date,
      startTime: values.slotStartTime,
      feeKind: values.feeKind,
      feeAmountPaise,
    };
  }
  return {
    kind: "one_to_one",
    teacherId: values.teacherId,
    date: values.date,
    startTime: values.startTime,
    endTime: values.endTime,
    feeKind: values.feeKind,
    feeAmountPaise,
  };
}

function slotUnavailableLabel(slot: DemoSlot): string | null {
  if (slot.bookable) return null;
  const why =
    slot.status === "cancelled"
      ? "Cancelled"
      : slot.status === "moved"
        ? "Moved"
        : slot.status === "holiday"
          ? "Holiday"
          : "Already started";
  return slot.reason ? `${why} · ${slot.reason}` : why;
}

function ChoiceRadio({
  id,
  value,
  label,
  detail,
  disabled = false,
}: {
  id: string;
  value: string;
  label: string;
  detail?: string | null;
  disabled?: boolean;
}) {
  return (
    <Label
      htmlFor={id}
      className={`has-data-checked:border-primary has-data-checked:bg-primary/5 flex items-start gap-3 rounded-xl border p-3 font-normal ${disabled ? "cursor-not-allowed opacity-60" : "hover:border-primary/60 cursor-pointer"}`}
    >
      <RadioGroupItem
        id={id}
        value={value}
        disabled={disabled}
        className="mt-0.5"
      />
      <span className="min-w-0 space-y-0.5">
        <span className="block font-medium">{label}</span>
        {detail ? (
          <span className="text-muted-foreground block text-xs">{detail}</span>
        ) : null}
      </span>
    </Label>
  );
}

function BatchSlots({
  batchId,
  date,
  control,
  error,
}: {
  batchId: string;
  date: string;
  control: Control<BookDemoValues>;
  error?: string;
}) {
  const slots = useQuery(enquiryQueries.demoSlots(batchId, date));
  if (slots.isPending) {
    return (
      <p
        role="status"
        className="text-muted-foreground flex items-center gap-2 text-sm"
      >
        <Spinner className="size-4" aria-hidden="true" />
        Loading that day’s Classes…
      </p>
    );
  }
  if (slots.isError) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {slots.error.message || "Couldn’t load that day’s Classes."}
      </p>
    );
  }
  if (slots.data.items.length === 0) {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed p-3 text-sm">
        This Batch has no Class on {dayDate(date)}. Choose another date.
      </p>
    );
  }
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">
        Class on {dayDate(date)}
      </legend>
      <Controller
        name="slotStartTime"
        control={control}
        render={({ field }) => (
          <RadioGroup
            name={field.name}
            value={field.value}
            onValueChange={(value) => {
              if (typeof value === "string") field.onChange(value);
            }}
            aria-invalid={error != null}
            className="gap-2 sm:grid-cols-2"
          >
            {slots.data.items.map((slot) => {
              const unavailable = slotUnavailableLabel(slot);
              return (
                <ChoiceRadio
                  key={`${slot.startTime}-${slot.status}`}
                  id={`demo-slot-${slot.startTime}-${slot.status}`}
                  value={slot.startTime}
                  disabled={!slot.bookable}
                  label={`${clockLabel(slot.startTime)}–${clockLabel(slot.endTime)}`}
                  detail={
                    unavailable ??
                    (slot.rescheduled
                      ? `Rescheduled${slot.reason ? ` · ${slot.reason}` : ""}`
                      : null)
                  }
                />
              );
            })}
          </RadioGroup>
        )}
      />
      <FieldError message={error} />
    </fieldset>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  items,
  placeholder,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: { value: string; label: string }[];
  placeholder: string;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        items={items}
        value={value === "" ? null : value}
        onValueChange={(next) => {
          if (next == null) return;
          onChange(next);
        }}
      >
        <SelectTrigger
          id={id}
          size="lg"
          className="w-full min-w-0"
          aria-invalid={error != null}
        >
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
      <FieldError message={error} />
    </div>
  );
}

export function BookDemoDialog({
  open,
  onOpenChange,
  prospectName,
  options,
  courseId,
  onSubmit,
  today = todayInKolkata(),
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospectName: string;
  options: EnquiryOptionsResponse;
  /** The Enquiry's Course; its Batches are listed first. */
  courseId: string | null;
  onSubmit: (input: BookDemoInput) => Promise<void>;
  today?: string;
}) {
  const defaults: BookDemoValues = {
    kind: "batch",
    batchId: "",
    date: today,
    slotStartTime: "",
    teacherId: options.currentTeacherId ?? "",
    startTime: "",
    endTime: "",
    feeKind: "free",
    amountRupees: "",
  };
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BookDemoValues>({
    resolver: zodResolver(bookDemoSchema(today)),
    defaultValues: defaults,
  });
  const kind = useWatch({ control, name: "kind" });
  const batchId = useWatch({ control, name: "batchId" });
  const date = useWatch({ control, name: "date" });
  const feeKind = useWatch({ control, name: "feeKind" });

  const batches = [...options.batches].sort((a, b) => {
    const aMatch = a.courseId === courseId ? 0 : 1;
    const bMatch = b.courseId === courseId ? 0 : 1;
    return aMatch - bMatch || a.name.localeCompare(b.name);
  });
  const batchItems = batches.map((batch) => ({
    value: batch.id,
    label: `${batch.name} · ${batch.courseName}`,
  }));
  const teacherItems = options.teachers.map((teacher) => ({
    value: teacher.id,
    label: teacher.name,
  }));
  const close = () => {
    reset(defaults);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          close();
          return;
        }
        onOpenChange(true);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Book demo</DialogTitle>
          <DialogDescription>
            A trial class for {prospectName}. A Batch demo doesn’t take a seat
            in the Batch.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-5"
          onSubmit={handleSubmit(async (values) => {
            try {
              await onSubmit(bookDemoValuesToInput(values));
              reset(defaults);
            } catch (error) {
              applyBookDemoError(error, values, setError);
            }
          })}
        >
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Kind of demo</legend>
            <Controller
              name="kind"
              control={control}
              render={({ field }) => (
                <RadioGroup
                  name={field.name}
                  value={field.value}
                  onValueChange={(value) => {
                    if (value === "batch" || value === "one_to_one")
                      field.onChange(value);
                  }}
                  className="gap-2 sm:grid-cols-2"
                >
                  <ChoiceRadio
                    id="demo-kind-batch"
                    value="batch"
                    label="Batch demo"
                    detail="Sits in one Class of a running Batch"
                  />
                  <ChoiceRadio
                    id="demo-kind-one-to-one"
                    value="one_to_one"
                    label="One-to-one"
                    detail="A Teacher at a time you choose"
                  />
                </RadioGroup>
              )}
            />
          </fieldset>

          {kind === "batch" ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
                <Controller
                  name="batchId"
                  control={control}
                  render={({ field }) => (
                    <SelectField
                      id="demo-batch"
                      label="Batch"
                      value={field.value}
                      items={batchItems}
                      placeholder={
                        batchItems.length === 0
                          ? "No open Batches"
                          : "Choose a Batch"
                      }
                      error={errors.batchId?.message}
                      onChange={(value) => {
                        field.onChange(value);
                        setValue("slotStartTime", "");
                      }}
                    />
                  )}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="demo-date">Date</Label>
                  <Input
                    id="demo-date"
                    type="date"
                    className="h-10"
                    min={today}
                    aria-invalid={errors.date != null}
                    {...register("date", {
                      onChange: () => {
                        setValue("slotStartTime", "");
                      },
                    })}
                  />
                  <FieldError message={errors.date?.message} />
                </div>
              </div>
              {batchId !== "" && date !== "" && date >= today ? (
                <BatchSlots
                  batchId={batchId}
                  date={date}
                  control={control}
                  error={errors.slotStartTime?.message}
                />
              ) : null}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Controller
                  name="teacherId"
                  control={control}
                  render={({ field }) => (
                    <SelectField
                      id="demo-teacher"
                      label="Teacher"
                      value={field.value}
                      items={teacherItems}
                      placeholder={
                        teacherItems.length === 0
                          ? "No active Teachers"
                          : "Choose a Teacher"
                      }
                      error={errors.teacherId?.message}
                      onChange={field.onChange}
                    />
                  )}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="demo-one-date">Date</Label>
                <Input
                  id="demo-one-date"
                  type="date"
                  className="h-10"
                  min={today}
                  aria-invalid={errors.date != null}
                  {...register("date")}
                />
                <FieldError message={errors.date?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="demo-start">Start time</Label>
                <Input
                  id="demo-start"
                  type="time"
                  className="h-10"
                  aria-invalid={errors.startTime != null}
                  {...register("startTime")}
                />
                <FieldError message={errors.startTime?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="demo-end">End time</Label>
                <Input
                  id="demo-end"
                  type="time"
                  className="h-10"
                  aria-invalid={errors.endTime != null}
                  {...register("endTime")}
                />
                <FieldError message={errors.endTime?.message} />
              </div>
            </div>
          )}

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Demo fee</legend>
            <Controller
              name="feeKind"
              control={control}
              render={({ field }) => (
                <RadioGroup
                  name={field.name}
                  value={field.value}
                  onValueChange={(value) => {
                    if (value === "free" || value === "paid")
                      field.onChange(value);
                  }}
                  className="grid-cols-2 gap-2"
                >
                  <ChoiceRadio id="demo-fee-free" value="free" label="Free" />
                  <ChoiceRadio id="demo-fee-paid" value="paid" label="Paid" />
                </RadioGroup>
              )}
            />
            {feeKind === "paid" ? (
              <div className="space-y-1.5 pt-2">
                <Label htmlFor="demo-amount">Amount (₹)</Label>
                <Input
                  id="demo-amount"
                  className="h-10"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="e.g. 200"
                  aria-invalid={errors.amountRupees != null}
                  {...register("amountRupees")}
                />
                <p className="text-muted-foreground text-xs">
                  Collected separately. Demo fees never become course dues.
                </p>
                <FieldError message={errors.amountRupees?.message} />
              </div>
            ) : null}
          </fieldset>

          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Booking…" : "Book demo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
