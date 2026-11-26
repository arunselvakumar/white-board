"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

import { FormAlert } from "@/components/auth/form-alert";
import {
  SelectField,
  TextareaField,
  TextField,
} from "@/app/(app)/preschool/_components/form-fields";
import { todayInIndia } from "@/src/preschool/domain/dates";
import { QueryHttpError } from "@/src/queries/http";
import {
  logPreschoolEnquiryFollowUp,
  markPreschoolEnquiryLost,
  movePreschoolEnquiry,
  preschoolEnquiryKeys,
  reopenPreschoolEnquiry,
  type PreschoolEnquiry,
} from "@/src/queries/preschool/enquiries";

export type MovableStatus = "contacted" | "visit_scheduled" | "visited";

/** What a card menu or the detail page asked to do with an Enquiry. */
export type EnquiryAction =
  | { kind: "follow-up"; enquiry: PreschoolEnquiry }
  | { kind: "schedule-visit"; enquiry: PreschoolEnquiry }
  | { kind: "lost"; enquiry: PreschoolEnquiry };

function messageOf(error: unknown, fallback: string): string {
  return error instanceof QueryHttpError && error.message !== ""
    ? error.message
    : fallback;
}

/** Status moves that need no more input, and Reopen. */
export function useEnquiryMoves() {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: preschoolEnquiryKeys.all });
  const move = useMutation({
    mutationFn: (input: { id: string; status: "contacted" | "visited" }) =>
      movePreschoolEnquiry(input.id, { status: input.status }),
    onSuccess: refresh,
  });
  const reopen = useMutation({
    mutationFn: (id: string) => reopenPreschoolEnquiry(id),
    onSuccess: refresh,
  });
  const error = move.error ?? reopen.error;
  return {
    move,
    reopen,
    error:
      error == null
        ? undefined
        : messageOf(error, "Could not change this Enquiry. Please try again."),
  };
}

const KIND_OPTIONS = [
  { value: "call", label: "Call" },
  { value: "visit", label: "Visit" },
  { value: "note", label: "Note" },
] as const;

const NEW_STATUS_OPTIONS = [
  { value: "same", label: "Keep the status" },
  { value: "contacted", label: "Contacted" },
  { value: "visit_scheduled", label: "Visit scheduled" },
  { value: "visited", label: "Visited" },
] as const;

const followUpSchema = z
  .object({
    kind: z.enum(["call", "visit", "note"]),
    note: z.string().trim().min(1, "Write what happened").max(2000),
    nextFollowUpOn: z.string(),
    status: z.enum(["same", "contacted", "visit_scheduled", "visited"]),
    visitOn: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.status === "visit_scheduled" && value.visitOn === "")
      ctx.addIssue({
        code: "custom",
        path: ["visitOn"],
        message: "Choose the date of the visit",
      });
  });

function FollowUpForm({
  enquiry,
  onDone,
}: {
  enquiry: PreschoolEnquiry;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof followUpSchema>>({
    resolver: zodResolver(followUpSchema),
    defaultValues: {
      kind: "call",
      note: "",
      nextFollowUpOn: "",
      status: "same",
      visitOn: enquiry.visitOn ?? "",
    },
  });
  const status = useWatch({ control, name: "status" });
  return (
    <form
      noValidate
      aria-label="Log follow-up"
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        try {
          await logPreschoolEnquiryFollowUp(enquiry.id, {
            kind: values.kind,
            note: values.note,
            nextFollowUpOn:
              values.nextFollowUpOn === "" ? null : values.nextFollowUpOn,
            ...(values.status === "same"
              ? {}
              : {
                  status: values.status,
                  visitOn: values.visitOn === "" ? null : values.visitOn,
                }),
          });
          await queryClient.invalidateQueries({
            queryKey: preschoolEnquiryKeys.all,
          });
          onDone();
        } catch (error) {
          setError("root", {
            message: messageOf(error, "Could not save the follow-up."),
          });
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="follow-up-kind"
          name="kind"
          label="What happened"
          required
          control={control}
          options={KIND_OPTIONS}
          error={errors.kind}
        />
        <TextField
          id="follow-up-next"
          name="nextFollowUpOn"
          label="Next follow-up"
          type="date"
          register={register}
          error={errors.nextFollowUpOn}
        />
      </div>
      <TextareaField
        id="follow-up-note"
        name="note"
        label="Note"
        required
        register={register}
        error={errors.note}
        placeholder="Spoke to the mother; she wants to see the play area."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="follow-up-status"
          name="status"
          label="Status"
          control={control}
          options={NEW_STATUS_OPTIONS}
          error={errors.status}
        />
        {status === "visit_scheduled" ? (
          <TextField
            id="follow-up-visit"
            name="visitOn"
            label="Visit date"
            type="date"
            required
            register={register}
            error={errors.visitOn}
          />
        ) : null}
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save follow-up"}
        </Button>
      </DialogFooter>
    </form>
  );
}

const visitSchema = z.object({
  visitOn: z.string().min(1, "Choose the date of the visit"),
  note: z.string().trim().max(2000),
});

function ScheduleVisitForm({
  enquiry,
  onDone,
}: {
  enquiry: PreschoolEnquiry;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof visitSchema>>({
    resolver: zodResolver(visitSchema),
    defaultValues: { visitOn: enquiry.visitOn ?? "", note: "" },
  });
  return (
    <form
      noValidate
      aria-label="Schedule visit"
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        try {
          await movePreschoolEnquiry(enquiry.id, {
            status: "visit_scheduled",
            visitOn: values.visitOn,
            note: values.note === "" ? null : values.note,
            nextFollowUpOn: values.visitOn,
          });
          await queryClient.invalidateQueries({
            queryKey: preschoolEnquiryKeys.all,
          });
          onDone();
        } catch (error) {
          setError("root", {
            message: messageOf(error, "Could not schedule the visit."),
          });
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <TextField
        id="visit-date"
        name="visitOn"
        label="Visit date"
        type="date"
        required
        register={register}
        error={errors.visitOn}
        hint="The next follow-up is set to the same day."
      />
      <TextareaField
        id="visit-note"
        name="note"
        label="Note"
        register={register}
        error={errors.note}
        rows={2}
      />
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Schedule visit"}
        </Button>
      </DialogFooter>
    </form>
  );
}

const lostSchema = z.object({
  reason: z.string().trim().min(1, "Say why the Enquiry was lost").max(200),
});

function MarkLostForm({
  enquiry,
  onDone,
}: {
  enquiry: PreschoolEnquiry;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof lostSchema>>({
    resolver: zodResolver(lostSchema),
    defaultValues: { reason: "" },
  });
  return (
    <form
      noValidate
      aria-label="Mark lost"
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        try {
          await markPreschoolEnquiryLost(enquiry.id, values.reason);
          await queryClient.invalidateQueries({
            queryKey: preschoolEnquiryKeys.all,
          });
          onDone();
        } catch (error) {
          setError("root", {
            message: messageOf(error, "Could not mark the Enquiry lost."),
          });
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <TextField
        id="lost-reason"
        name="reason"
        label="Reason"
        required
        register={register}
        error={errors.reason}
        placeholder="Chose a school nearer home"
      />
      <DialogFooter>
        <Button type="submit" variant="destructive" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Mark lost"}
        </Button>
      </DialogFooter>
    </form>
  );
}

const TITLES = {
  "follow-up": "Log follow-up",
  "schedule-visit": "Schedule visit",
  lost: "Mark lost",
} as const;

/** The dialog for one Enquiry action; `action` null keeps it closed. */
export function EnquiryActionDialog({
  action,
  onClose,
}: {
  action: EnquiryAction | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={action != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {action == null ? null : (
          <>
            <DialogHeader>
              <DialogTitle>{TITLES[action.kind]}</DialogTitle>
              <DialogDescription>
                {action.enquiry.childName} · {action.enquiry.parentName}
              </DialogDescription>
            </DialogHeader>
            {action.kind === "follow-up" ? (
              <FollowUpForm enquiry={action.enquiry} onDone={onClose} />
            ) : action.kind === "schedule-visit" ? (
              <ScheduleVisitForm enquiry={action.enquiry} onDone={onClose} />
            ) : (
              <MarkLostForm enquiry={action.enquiry} onDone={onClose} />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Today in India, for date inputs' defaults and "due" markers. */
export function todayHere(): string {
  return todayInIndia(new Date());
}
