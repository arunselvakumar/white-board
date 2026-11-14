"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId } from "react";
import { useForm, useWatch } from "react-hook-form";
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
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { useVoidCheckIn, type CheckInEntry } from "@/src/queries/check-ins";

import {
  ACTION_LABELS,
  formatTime,
} from "@/app/app/projects/[id]/attendance/check-in/_components/check-in-format";

/** As the API's: 1 to 200 characters. */
export const VOID_REASON_MAX = 200;

const schema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Give a reason")
    .max(VOID_REASON_MAX, `Use at most ${String(VOID_REASON_MAX)} characters`),
});

type Values = z.infer<typeof schema>;

export const VOID_EXPLAINED = "The entry stays in the log, struck out.";
export const VOID_LABOUR_DAY =
  "A Labour's day is worked out again from the entries left.";

/**
 * Void a wrong check-in entry with a reason (ADR CM-0043 §2, §8). Entries
 * are never edited; a Labour's day follows the entries left.
 */
export function VoidEntryDialog({
  projectId,
  entry,
  timeZone,
  onClose,
  onVoided,
}: {
  projectId: string;
  /** The entry to void; null keeps the dialog closed. */
  entry: CheckInEntry | null;
  timeZone: string;
  onClose: () => void;
  onVoided: (entry: CheckInEntry) => void;
}) {
  const id = useId();
  const voiding = useVoidCheckIn(projectId);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { reason: "" },
  });
  const errors = form.formState.errors;
  const length = useWatch({ control: form.control, name: "reason" }).length;
  const { reset } = form;
  const resetMutation = voiding.reset;

  useEffect(() => {
    if (entry != null) {
      reset({ reason: "" });
      resetMutation();
    }
  }, [entry, reset, resetMutation]);

  const submit = form.handleSubmit(async (values) => {
    if (entry == null) return;
    try {
      const result = await voiding.mutateAsync({
        id: entry.id,
        reason: values.reason,
      });
      onVoided(result.entry);
    } catch (error) {
      form.setError("root", { message: fieldForCode(error, {}).message });
    }
  });

  return (
    <Dialog
      open={entry != null}
      // Closing while the request is out would let its answer land on the
      // next entry's dialog.
      onOpenChange={(open) => {
        if (!open && !voiding.isPending) onClose();
      }}
    >
      <DialogContent className="grid-cols-1 sm:max-w-md">
        <form
          noValidate
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>Void this entry</DialogTitle>
            <DialogDescription>
              {entry == null
                ? null
                : `${entry.personName} · ${ACTION_LABELS[entry.action]} ${formatTime(entry.at, timeZone)}. `}
              {VOID_EXPLAINED}
              {entry?.kind === "labour" ? ` ${VOID_LABOUR_DAY}` : null}
            </DialogDescription>
          </DialogHeader>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`${id}-reason`} required>
              Reason
            </Label>
            <Textarea
              id={`${id}-reason`}
              rows={3}
              aria-required
              aria-invalid={errors.reason != null}
              aria-describedby={`${id}-reason-count`}
              placeholder="Checked in the wrong person"
              {...form.register("reason")}
            />
            <div className="flex items-start justify-between gap-3">
              <FieldError message={errors.reason?.message} />
              <p
                id={`${id}-reason-count`}
                className="text-muted-foreground ml-auto text-xs tabular-nums"
              >
                {length}/{VOID_REASON_MAX}
              </p>
            </div>
          </div>
          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={voiding.isPending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={voiding.isPending}
            >
              {voiding.isPending ? "Voiding…" : "Void entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
