"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@repo/auth/react";
import { Badge } from "@repo/ui/components/badge";
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
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Textarea } from "@repo/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import type { FamilyHomeRole } from "@/components/home/family-home";
import {
  absenceNoticeQueries,
  giveAbsenceNotice,
  type GiveAbsenceNoticeInput,
  type PickableClassView,
} from "@/src/queries/absence-notices";
import { QueryHttpError } from "@/src/queries/http";
import {
  ABSENCE_NOTE_MAX,
  ABSENCE_REASON_LABELS,
  ABSENCE_REASONS,
  isAbsenceReason,
} from "@/src/training-institute/domain/absence-notice";

import {
  classCount,
  classesByDay,
  noticeDayLabel,
  pickKey,
} from "./absence-notice-format";

const REASON_ITEMS = ABSENCE_REASONS.map((value) => ({
  value,
  label: ABSENCE_REASON_LABELS[value],
}));

const schema = z.object({
  classes: z.array(z.string()).min(1, "Pick at least one Class."),
  reason: z.string().transform((value, ctx) => {
    if (isAbsenceReason(value)) return value;
    ctx.addIssue({ code: "custom", message: "Choose a reason" });
    return z.NEVER;
  }),
  note: z
    .string()
    .trim()
    .max(
      ABSENCE_NOTE_MAX,
      `Keep the note to ${String(ABSENCE_NOTE_MAX)} characters or fewer.`,
    ),
});

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

const EMPTY: FormInput = { classes: [], reason: "", note: "" };

/**
 * Give an Absence Notice for one Student: pick upcoming Classes (the next 60
 * days), a reason, and an optional note. One notice is saved per Class.
 */
export function GiveAbsenceNoticeDialog({
  open,
  onOpenChange,
  student,
  role,
  now,
  onGiven,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: { id: string; name: string };
  role: FamilyHomeRole;
  now: Date;
  /** Called with the number of Classes noticed, after the dialog closes. */
  onGiven: (count: number) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-cols-1 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Give absence notice</DialogTitle>
          <DialogDescription>
            {role === "parent"
              ? `Tell the Teacher ahead of time that ${student.name} will miss these Classes.`
              : "Tell the Teacher ahead of time that you’ll miss these Classes."}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <GiveAbsenceNoticeForm
            student={student}
            role={role}
            now={now}
            onCancel={() => {
              onOpenChange(false);
            }}
            onGiven={(count) => {
              onOpenChange(false);
              onGiven(count);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function GiveAbsenceNoticeForm({
  student,
  role,
  now,
  onCancel,
  onGiven,
}: {
  student: { id: string; name: string };
  role: FamilyHomeRole;
  now: Date;
  onCancel: () => void;
  onGiven: (count: number) => void;
}) {
  const { workspaceId, userId } = useAuth();
  const sessionScope = `${String(workspaceId)}:${String(userId)}:${role}`;
  const queryClient = useQueryClient();
  // The picker is read only once the dialog is open; a failure stays in it.
  const classesQuery = useQuery(absenceNoticeQueries.classes(sessionScope));
  const give = useMutation({ mutationFn: giveAbsenceNotice });

  const {
    control,
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });
  const picked = useWatch({ control, name: "classes" });
  const note = useWatch({ control, name: "note" });

  const classes =
    classesQuery.data?.students.find((candidate) => candidate.id === student.id)
      ?.classes ?? [];
  const pickable = new Map(
    classes
      .filter((item) => item.noticeId == null)
      .map((item) => [pickKey(item), item]),
  );
  // A Class noticed elsewhere since the picker loaded drops out of the pick.
  const pickedNow = picked.filter((key) => pickable.has(key));
  const severalBatches = new Set(classes.map((item) => item.batchId)).size > 1;

  async function submit(values: FormOutput) {
    const chosen = values.classes.flatMap((key) => {
      const item = pickable.get(key);
      return item == null ? [] : [item];
    });
    if (chosen.length === 0) {
      setError("classes", { message: "Pick at least one Class." });
      return;
    }
    const input: GiveAbsenceNoticeInput = {
      studentId: student.id,
      classes: chosen.map((item) => ({
        enrollmentId: item.enrollmentId,
        date: item.date,
        startTime: item.startTime,
      })),
      reason: values.reason,
      note: values.note === "" ? null : values.note,
    };
    try {
      await give.mutateAsync(input);
    } catch (error) {
      if (error instanceof QueryHttpError && error.status === 409) {
        // A Class started, changed, or was noticed meanwhile: show the latest.
        setValue("classes", pickedNow);
        await queryClient.invalidateQueries({
          queryKey: absenceNoticeQueries.key.all,
        });
      }
      setError("root", {
        message:
          error instanceof Error && error.message !== ""
            ? error.message
            : "Couldn’t send the absence notice. Please try again.",
      });
      return;
    }
    await queryClient.invalidateQueries({
      queryKey: absenceNoticeQueries.key.all,
    });
    onGiven(chosen.length);
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(submit)}
      aria-label="Give absence notice"
    >
      <fieldset className="min-w-0 space-y-2">
        <legend className="text-sm font-medium">Classes</legend>
        {classesQuery.isPending ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : classesQuery.isError ? (
          <div className="space-y-2">
            <p role="alert" className="text-destructive text-sm">
              Couldn’t load the upcoming Classes.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void classesQuery.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : classes.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No upcoming Classes in the next 60 days.
          </p>
        ) : (
          <Controller
            name="classes"
            control={control}
            render={({ field }) => (
              <ClassPicker
                classes={classes}
                picked={field.value}
                severalBatches={severalBatches}
                now={now}
                onChange={field.onChange}
              />
            )}
          />
        )}
        <FieldError message={errors.classes?.message} />
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor={`absence-reason-${student.id}`}>Reason</Label>
        <Controller
          name="reason"
          control={control}
          render={({ field }) => (
            <Select
              items={REASON_ITEMS}
              value={field.value === "" ? null : field.value}
              onValueChange={(value) => {
                if (value != null) field.onChange(value);
              }}
            >
              <SelectTrigger
                id={`absence-reason-${student.id}`}
                className="w-full"
                aria-invalid={errors.reason != null}
              >
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                {REASON_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError message={errors.reason?.message} />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor={`absence-note-${student.id}`}>Note (optional)</Label>
          <span className="text-muted-foreground text-xs tabular-nums">
            {note.length}/{ABSENCE_NOTE_MAX}
          </span>
        </div>
        <Textarea
          id={`absence-note-${student.id}`}
          rows={3}
          maxLength={ABSENCE_NOTE_MAX}
          placeholder="e.g. Cousin’s wedding in Madurai"
          aria-invalid={errors.note != null}
          {...register("note")}
        />
        <FieldError message={errors.note?.message} />
      </div>

      <FormAlert message={errors.root?.message} />

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pickedNow.length === 0 || isSubmitting}>
          {isSubmitting
            ? "Sending…"
            : pickedNow.length === 0
              ? "Give notice"
              : `Give notice for ${classCount(pickedNow.length)}`}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ClassPicker({
  classes,
  picked,
  severalBatches,
  now,
  onChange,
}: {
  classes: PickableClassView[];
  picked: string[];
  severalBatches: boolean;
  now: Date;
  onChange: (picked: string[]) => void;
}) {
  const chosen = new Set(picked);
  return (
    <div className="max-h-[45dvh] space-y-3 overflow-y-auto rounded-lg border p-3">
      {classesByDay(classes).map((day) => {
        const dayId = `absence-day-${day.date}`;
        const first = day.classes[0];
        return (
          <div key={day.date} role="group" aria-labelledby={dayId}>
            <p
              id={dayId}
              className="text-muted-foreground mb-1 text-xs font-medium"
            >
              {first == null
                ? day.date
                : noticeDayLabel(day.date, first.timezone, now)}
            </p>
            <ul className="space-y-1">
              {day.classes.map((item) => {
                const key = pickKey(item);
                const id = `absence-class-${key.replaceAll(/[|:]/g, "-")}`;
                const noticed = item.noticeId != null;
                return (
                  <li key={key}>
                    <Label
                      htmlFor={id}
                      className="hover:bg-muted/60 has-data-disabled:text-muted-foreground flex min-h-10 items-center gap-3 rounded-md px-2 py-1.5 font-normal has-data-disabled:cursor-not-allowed has-data-disabled:hover:bg-transparent"
                    >
                      <Checkbox
                        id={id}
                        checked={!noticed && chosen.has(key)}
                        disabled={noticed}
                        onCheckedChange={(next) => {
                          onChange(
                            next
                              ? [...picked, key]
                              : picked.filter((value) => value !== key),
                          );
                        }}
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="tabular-nums">
                          {item.startTime}–{item.endTime}
                        </span>
                        {severalBatches && (
                          <span className="text-muted-foreground truncate text-xs">
                            {item.courseName} · {item.batchName}
                          </span>
                        )}
                      </span>
                      {item.rescheduled && (
                        <Badge variant="secondary">Rescheduled</Badge>
                      )}
                      {noticed && <Badge variant="outline">Notice given</Badge>}
                    </Label>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
