"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { Label, RequiredIndicator } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { VISIT_LIMITS } from "@/src/marketing/domain/marketing-terms";
import { QueryHttpError } from "@/src/queries/http";
import {
  useCancelVisit,
  useRescheduleVisit,
  visitErrorMessage,
  type Visit,
} from "@/src/queries/marketing-visits";

import { visitWhen, zoneFields, zoneIso } from "./visit-parts";

/** The `details.field` a refusal names, when it is one of `fields`. */
function fieldOf<T extends string>(
  error: unknown,
  fields: Record<string, T>,
): T | null {
  if (!(error instanceof QueryHttpError)) return null;
  const raw = (error.details as { field?: unknown } | undefined)?.field;
  return typeof raw === "string" ? (fields[raw] ?? null) : null;
}

const rescheduleSchema = z.object({
  date: z.string().min(1, "Choose the new date."),
  time: z.string().min(1, "Enter the new time."),
});
type RescheduleValues = z.infer<typeof rescheduleSchema>;

/**
 * Moves a planned (or Missed) Visit to a new date and time in the Company
 * time zone; the old time stays in its history.
 */
export function RescheduleVisitDialog({
  visit,
  open,
  onOpenChange,
}: {
  visit: Visit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const reschedule = useRescheduleVisit(visit.id);
  const [error, setError] = useState<string | null>(null);
  const fresh = () => zoneFields(new Date(visit.visitAt), visit.timeZone);
  const form = useForm<RescheduleValues>({
    resolver: zodResolver(rescheduleSchema),
    defaultValues: fresh(),
  });
  const errors = form.formState.errors;

  const dismiss = () => {
    form.reset(fresh());
    setError(null);
    onOpenChange(false);
  };

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await reschedule.mutateAsync({
        visitAt: zoneIso(values.date, values.time, visit.timeZone),
        expectedUpdatedAt: visit.updatedAt,
      });
      dismiss();
    } catch (caught) {
      if (fieldOf(caught, { visitAt: "date" }) != null) {
        form.setError("date", { message: visitErrorMessage(caught) });
        return;
      }
      setError(visitErrorMessage(caught));
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="max-h-[90dvh] grid-cols-1 overflow-y-auto sm:max-w-md">
        <form
          noValidate
          aria-label="Reschedule Visit"
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>Reschedule Visit</DialogTitle>
            <DialogDescription className="break-words">
              {`${visit.number} is planned for ${visitWhen(visit.visitAt, visit.timeZone)}. The old time stays in its history.`}
            </DialogDescription>
          </DialogHeader>
          <fieldset className="min-w-0 space-y-1.5">
            <legend className="text-sm leading-none font-medium">
              New date and time
              <RequiredIndicator />
            </legend>
            <div className="mt-1.5 grid grid-cols-[1fr_7rem] gap-2">
              <Input
                type="date"
                aria-label="New date"
                aria-required
                aria-invalid={errors.date != null}
                {...form.register("date")}
              />
              <Input
                type="time"
                aria-label="New time"
                aria-required
                aria-invalid={errors.time != null}
                {...form.register("time")}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              {`In the Company time zone (${visit.timeZone}).`}
            </p>
            <FieldError
              message={errors.date?.message ?? errors.time?.message}
            />
          </fieldset>
          <FormAlert message={error ?? undefined} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={dismiss}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving…" : "Reschedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const cancelSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Say why the Visit is cancelled.")
    .max(
      VISIT_LIMITS.cancelReason,
      `Keep the reason to ${String(VISIT_LIMITS.cancelReason)} characters.`,
    ),
});
type CancelValues = z.infer<typeof cancelSchema>;

/** Cancels a planned (or Missed) Visit, with the reason. */
export function CancelVisitDialog({
  visit,
  open,
  onOpenChange,
}: {
  visit: Visit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const cancel = useCancelVisit(visit.id);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<CancelValues>({
    resolver: zodResolver(cancelSchema),
    defaultValues: { reason: "" },
  });
  const errors = form.formState.errors;

  const dismiss = () => {
    form.reset({ reason: "" });
    setError(null);
    onOpenChange(false);
  };

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await cancel.mutateAsync({
        reason: values.reason,
        expectedUpdatedAt: visit.updatedAt,
      });
      dismiss();
    } catch (caught) {
      if (fieldOf(caught, { reason: "reason" }) != null) {
        form.setError("reason", { message: visitErrorMessage(caught) });
        return;
      }
      setError(visitErrorMessage(caught));
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="max-h-[90dvh] grid-cols-1 overflow-y-auto sm:max-w-md">
        <form
          noValidate
          aria-label="Cancel Visit"
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>Cancel Visit</DialogTitle>
            <DialogDescription className="break-words">
              {`${visit.number} to ${visit.prospectCompany.name} will not happen. A cancelled Visit cannot be changed, but notes can still be added.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-visit-reason" required>
              Reason
            </Label>
            <Textarea
              id="cancel-visit-reason"
              rows={3}
              placeholder="Client not available this week"
              aria-required
              aria-invalid={errors.reason != null}
              {...form.register("reason")}
            />
            <FieldError message={errors.reason?.message} />
          </div>
          <FormAlert message={error ?? undefined} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={dismiss}>
              Keep Visit
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Saving…" : "Cancel Visit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
