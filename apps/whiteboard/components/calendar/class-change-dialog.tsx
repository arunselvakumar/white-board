"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@repo/ui/components/badge";
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
import { Textarea } from "@repo/ui/components/textarea";

import { formatDate, type CalendarEvent } from "@/lib/calendar-dates";
import {
  classChangeSummary,
  classMarker,
  clockLabel,
} from "@/lib/class-changes";
import type {
  CalendarItem,
  ClassKey,
  ClassSlotTime,
} from "@/src/queries/calendar";
import { classPath } from "@/src/queries/classes";
import {
  hasStarted,
  localNow,
} from "@/src/training-institute/domain/class-schedule";

export type ClassChangeActions = {
  onCancel: (key: ClassKey, reason: string | null) => Promise<void>;
  onMove: (
    key: ClassKey,
    input: ClassSlotTime & { reason: string | null },
  ) => Promise<void>;
  onRestore: (key: ClassKey) => Promise<void>;
};

type Mode = "menu" | "cancel" | "move";

const reason = z
  .string()
  .max(200, "Reason must be 200 characters or fewer.")
  .transform((value) => value.trim() || null);
const cancelSchema = z.object({ reason });
const moveSchema = z
  .object({
    date: z.iso.date("Choose a date."),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "Choose a start time."),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "Choose an end time."),
    reason,
  })
  .refine((value) => value.startTime < value.endTime, {
    path: ["endTime"],
    message: "End time must be after the start time.",
  });

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function CancelForm({
  onSubmit,
  onBack,
  rescheduled,
}: {
  onSubmit: (reason: string | null) => Promise<void>;
  onBack: () => void;
  rescheduled: boolean;
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<
    z.input<typeof cancelSchema>,
    unknown,
    z.output<typeof cancelSchema>
  >({
    resolver: zodResolver(cancelSchema),
    defaultValues: { reason: "" },
  });
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onSubmit(values.reason);
        } catch (error) {
          setError("root", { message: errorMessage(error) });
        }
      })}
    >
      <p className="text-muted-foreground">
        {rescheduled
          ? "The Rescheduled Class won't happen. Everyone who can see it will see it as cancelled."
          : "Everyone who can see this Class will see it as cancelled."}
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="cancel-reason">Reason (optional)</Label>
        <Textarea
          id="cancel-reason"
          placeholder="Pongal, Teacher unwell, power cut…"
          aria-invalid={errors.reason != null}
          {...register("reason")}
        />
        {errors.reason && (
          <p role="alert" className="text-destructive text-sm">
            {errors.reason.message}
          </p>
        )}
      </div>
      {errors.root?.message && (
        <p role="alert" className="text-destructive text-sm">
          {errors.root.message}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onBack}>
          Keep class
        </Button>
        <Button type="submit" variant="destructive" disabled={isSubmitting}>
          {isSubmitting ? "Cancelling…" : "Cancel class"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function MoveForm({
  initial,
  minDate,
  onSubmit,
  onBack,
}: {
  initial: ClassSlotTime;
  /** Today in the Batch's timezone; earlier dates are in the past. */
  minDate: string;
  onSubmit: (input: ClassSlotTime & { reason: string | null }) => Promise<void>;
  onBack: () => void;
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof moveSchema>, unknown, z.output<typeof moveSchema>>(
    {
      resolver: zodResolver(moveSchema),
      defaultValues: { ...initial, reason: "" },
    },
  );
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onSubmit(values);
        } catch (error) {
          setError("root", { message: errorMessage(error) });
        }
      })}
    >
      <p className="text-muted-foreground">
        The original slot shows as moved. The new slot is marked Rescheduled.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-3">
          <Label htmlFor="move-date">New date</Label>
          <Input
            id="move-date"
            type="date"
            min={minDate}
            aria-invalid={errors.date != null}
            {...register("date")}
          />
          {errors.date && (
            <p role="alert" className="text-destructive text-sm">
              {errors.date.message}
            </p>
          )}
        </div>
        <div className="space-y-1.5 sm:col-span-1">
          <Label htmlFor="move-start">Start</Label>
          <Input
            id="move-start"
            type="time"
            aria-invalid={errors.startTime != null}
            {...register("startTime")}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="move-end">End</Label>
          <Input
            id="move-end"
            type="time"
            aria-invalid={errors.endTime != null}
            {...register("endTime")}
          />
        </div>
        {(errors.startTime ?? errors.endTime) && (
          <p role="alert" className="text-destructive text-sm sm:col-span-3">
            {(errors.startTime ?? errors.endTime)?.message}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="move-reason">Reason (optional)</Label>
        <Textarea
          id="move-reason"
          placeholder="Exam week, Teacher travelling…"
          aria-invalid={errors.reason != null}
          {...register("reason")}
        />
        {errors.reason && (
          <p role="alert" className="text-destructive text-sm">
            {errors.reason.message}
          </p>
        )}
      </div>
      {errors.root?.message && (
        <p role="alert" className="text-destructive text-sm">
          {errors.root.message}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Moving…" : "Move class"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ClassChangeDialog({
  event,
  canChange,
  actions,
  onClose,
  now = new Date(),
}: {
  event: CalendarEvent<CalendarItem> | null;
  canChange: boolean;
  actions?: ClassChangeActions;
  onClose: () => void;
  now?: Date;
}) {
  const [mode, setMode] = useState<Mode>("menu");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (event == null) return null;
  const { item, scheduled } = event;
  const key: ClassKey = {
    batchId: item.batchId,
    date: event.date,
    startTime: scheduled.startTime,
  };
  const local = localNow(now, item.timezone);
  const started = hasStarted(scheduled, local);
  const change = scheduled.change;
  const originalStarted = change != null && hasStarted(change, local);
  const marker = classMarker(scheduled);
  const summary = classChangeSummary(scheduled);
  const editable = canChange && actions != null && !started;
  const close = () => {
    setMode("menu");
    setError(null);
    onClose();
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      close();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const canCancel = scheduled.status === "scheduled" || scheduled.rescheduled;
  // A Moved Class is moved again from its Rescheduled slot.
  const canMove = scheduled.status !== "moved";
  const canRestore =
    change != null &&
    !originalStarted &&
    (scheduled.rescheduled ||
      scheduled.status === "cancelled" ||
      scheduled.status === "moved");

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "cancel"
              ? "Cancel this class?"
              : mode === "move"
                ? "Move this class"
                : item.courseName}
          </DialogTitle>
          <DialogDescription>
            {item.batchName}
            {item.studentName ? ` · ${item.studentName}` : ""} ·{" "}
            {formatDate(event.date, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}{" "}
            · {clockLabel(scheduled.startTime)}–{clockLabel(scheduled.endTime)}
          </DialogDescription>
        </DialogHeader>

        {mode === "cancel" ? (
          <CancelForm
            rescheduled={scheduled.rescheduled}
            onBack={() => {
              setMode("menu");
            }}
            onSubmit={async (reason) => {
              await actions?.onCancel(key, reason);
              close();
            }}
          />
        ) : mode === "move" ? (
          <MoveForm
            minDate={local.date}
            initial={{
              date: event.date,
              startTime: scheduled.startTime,
              endTime: scheduled.endTime,
            }}
            onBack={() => {
              setMode("menu");
            }}
            onSubmit={async (input) => {
              await actions?.onMove(key, input);
              close();
            }}
          />
        ) : (
          <>
            {marker && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    marker === "Rescheduled" ? "secondary" : "destructive"
                  }
                >
                  {marker}
                </Badge>
                {summary && (
                  <span className="text-muted-foreground">{summary}</span>
                )}
              </div>
            )}
            {started && canChange && (
              <p className="text-muted-foreground">
                This Class has already started, so it can’t be changed.
              </p>
            )}
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <DialogFooter className="flex-wrap">
              {item.classMode !== "offline" && (
                <Button
                  variant="outline"
                  render={
                    <Link
                      href={classPath(key.batchId, key.date, key.startTime)}
                    />
                  }
                >
                  Open class page
                </Button>
              )}
              {editable && canRestore && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    void run(() => actions.onRestore(key));
                  }}
                >
                  {scheduled.rescheduled
                    ? "Restore original time"
                    : "Restore class"}
                </Button>
              )}
              {editable && canMove && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setMode("move");
                  }}
                >
                  {scheduled.rescheduled ? "Move again" : "Move class"}
                </Button>
              )}
              {editable && canCancel && (
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => {
                    setMode("cancel");
                  }}
                >
                  Cancel class
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
