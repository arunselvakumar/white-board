"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { Button, buttonVariants } from "@repo/ui/components/button";
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

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import {
  FOLLOW_UP_LIMITS,
  FOLLOW_UP_TYPE_LABELS,
} from "@/src/marketing/domain/marketing-terms";
import { errorField } from "@/src/queries/marketing-companies";
import {
  followUpErrorMessage,
  useCancelFollowUp,
  useDoneFollowUp,
  type FollowUp,
} from "@/src/queries/marketing-follow-ups";
import { newVisitPath, visitQuery } from "@/src/queries/marketing-visits";

import { dayWords } from "./follow-up-parts";

/** "Call to Sri Balaji Infra Projects, due 14 Nov 2026". */
function followUpWords(followUp: FollowUp): string {
  return `${FOLLOW_UP_TYPE_LABELS[followUp.type]} to ${followUp.prospectCompany.name}, due ${dayWords(followUp.dueDate)}`;
}

function doneSchema(today: string) {
  return z.object({
    resultNote: z
      .string()
      .max(
        FOLLOW_UP_LIMITS.resultNote,
        `Keep the result to ${String(FOLLOW_UP_LIMITS.resultNote)} characters.`,
      ),
    doneOn: z
      .string()
      .min(1, "Choose the day it was done.")
      .refine(
        (value) => value <= today,
        "A Follow-up cannot be done on a day still to come.",
      ),
  });
}
type DoneValues = z.infer<ReturnType<typeof doneSchema>>;

/**
 * Marks an Open Follow-up Done with what came of it and the day (today
 * unless changed, never after). A Visit-type one then offers Log the
 * visit: a new completed Visit with its company, its Visit's Contacts and
 * its owner as visitor filled in.
 */
export function DoneFollowUpDialog({
  followUp,
  today,
  canLogVisit,
  open,
  onOpenChange,
}: {
  followUp: FollowUp;
  /** The Company's today, `YYYY-MM-DD`. */
  today: string;
  /** Visits create: offer Log the visit after a Visit-type one. */
  canLogVisit: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [logging, setLogging] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setLogging(false);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90dvh] grid-cols-1 overflow-y-auto sm:max-w-md">
        {logging ? (
          <LogTheVisit
            followUp={followUp}
            onClose={() => {
              setLogging(false);
              onOpenChange(false);
            }}
          />
        ) : (
          <DoneForm
            followUp={followUp}
            today={today}
            onDone={() => {
              if (followUp.type === "visit" && canLogVisit) setLogging(true);
              else onOpenChange(false);
            }}
            onClose={() => {
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DoneForm({
  followUp,
  today,
  onDone,
  onClose,
}: {
  followUp: FollowUp;
  today: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const done = useDoneFollowUp(followUp.id);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<DoneValues>({
    resolver: zodResolver(doneSchema(today)),
    defaultValues: { resultNote: "", doneOn: today },
  });
  const errors = form.formState.errors;

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await done.mutateAsync({
        resultNote:
          values.resultNote.trim() === "" ? null : values.resultNote.trim(),
        doneOn: values.doneOn,
        expectedUpdatedAt: followUp.updatedAt,
      });
      onDone();
    } catch (caught) {
      const field = errorField(caught);
      if (field === "resultNote" || field === "doneOn") {
        form.setError(field, { message: followUpErrorMessage(caught) });
        return;
      }
      setError(followUpErrorMessage(caught));
    }
  });

  return (
    <form
      noValidate
      aria-label="Mark Follow-up done"
      className="flex min-w-0 flex-col gap-4"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <DialogHeader>
        <DialogTitle>Mark Follow-up done</DialogTitle>
        <DialogDescription className="break-words">
          {followUpWords(followUp)}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor="follow-up-result">Result</Label>
        <Textarea
          id="follow-up-result"
          rows={3}
          placeholder="Sent the rates; they will reply next week"
          aria-invalid={errors.resultNote != null}
          {...form.register("resultNote")}
        />
        <FieldError message={errors.resultNote?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="follow-up-done-on" required>
          Done on
        </Label>
        <Input
          id="follow-up-done-on"
          type="date"
          max={today}
          aria-required
          aria-invalid={errors.doneOn != null}
          className="sm:w-48"
          {...form.register("doneOn")}
        />
        <FieldError message={errors.doneOn?.message} />
      </div>
      <FormAlert message={error ?? undefined} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving…" : "Mark done"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** After a Visit-type one is Done: open the Visit form, filled in. */
function LogTheVisit({
  followUp,
  onClose,
}: {
  followUp: FollowUp;
  onClose: () => void;
}) {
  // Its Visit's Contacts become the points of contact, when it can be read.
  const source = useQuery({
    ...visitQuery(followUp.visit?.id ?? ""),
    enabled: followUp.visit?.canOpen === true,
    retry: false,
  });
  const loading = source.isPending && source.fetchStatus !== "idle";
  const href = newVisitPath("completed", followUp.prospectCompany.id, {
    contactIds: source.data?.contacts.map((contact) => contact.id) ?? [],
    visitorIds: [followUp.owner.id],
  });
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Follow-up done</DialogTitle>
        <DialogDescription className="break-words">
          {`Log the Visit you made to ${followUp.prospectCompany.name}, with what was discussed.`}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Not now
        </Button>
        {loading ? (
          <Button type="button" disabled>
            Loading…
          </Button>
        ) : (
          <Link href={href} className={buttonVariants()}>
            <CalendarCheck aria-hidden="true" />
            Log the visit
          </Link>
        )}
      </DialogFooter>
    </div>
  );
}

/** Cancels an Open Follow-up after asking; it stays under Cancelled. */
export function CancelFollowUpDialog({
  followUp,
  open,
  onOpenChange,
}: {
  followUp: FollowUp;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const cancel = useCancelFollowUp(followUp.id);
  const [error, setError] = useState<string | null>(null);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this Follow-up?</AlertDialogTitle>
          <AlertDialogDescription className="break-words">
            {`${followUpWords(followUp)}. It will not be done, and stays under Cancelled.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormAlert message={error ?? undefined} />
        <AlertDialogFooter>
          <AlertDialogCancel>Keep</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() => {
              setError(null);
              cancel.mutate(
                { expectedUpdatedAt: followUp.updatedAt },
                {
                  onSuccess: () => {
                    onOpenChange(false);
                  },
                  onError: (caught) => {
                    setError(followUpErrorMessage(caught));
                  },
                },
              );
            }}
          >
            Cancel Follow-up
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
