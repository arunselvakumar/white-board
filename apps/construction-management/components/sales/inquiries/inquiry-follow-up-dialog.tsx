"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm, type FieldPath } from "react-hook-form";
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
import { QueryHttpError } from "@/src/queries/http";
import {
  inquiryFormOptionsQuery,
  useAddFollowUp,
  type InquiryDetail,
} from "@/src/queries/sales-inquiries";
import {
  FOLLOW_UP_ACTIVITIES,
  FOLLOW_UP_ACTIVITY_LABELS,
  SALES_LIMITS,
  type FollowUpActivity,
} from "@/src/sales/domain/sales-terms";

import { InquirySelect } from "./inquiry-select";

const schema = z
  .object({
    activity: z.string().min(1, "Choose what was done."),
    doneOnDate: z.string().min(1, "Choose the date."),
    doneOnTime: z.string().min(1, "Enter the time."),
    remarks: z
      .string()
      .max(
        SALES_LIMITS.remarks,
        `Use at most ${String(SALES_LIMITS.remarks)} characters.`,
      ),
    toStageId: z.string(),
    nextFollowUpDate: z.string(),
    nextFollowUpTime: z.string(),
  })
  .superRefine((value, ctx) => {
    if (
      value.nextFollowUpDate !== "" &&
      value.nextFollowUpDate < value.doneOnDate
    )
      ctx.addIssue({
        code: "custom",
        message: "The next follow-up must be after Done on.",
        path: ["nextFollowUpDate"],
      });
  });
type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, FieldPath<Values>> = {
  activity: "activity",
  doneOn: "doneOnDate",
  remarks: "remarks",
  toStageId: "toStageId",
  nextFollowUp: "nextFollowUpDate",
};

const DATE_CODES = new Set([
  "BACKDATED_CREATE_BLOCKED",
  "FINANCIAL_PERIOD_CLOSED",
]);

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** The device's date and `HH:MM` now. */
function nowLocal(now: Date = new Date()): { date: string; time: string } {
  return {
    date: `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}

/**
 * **Add follow-up** on an Open inquiry (CM-1004, ADR CM-0022 §4): what was
 * done (Call, Site visit, Meeting, WhatsApp, Email, Other), Done on (now
 * by default; not in the future), remarks, an optional move to another
 * Funnel Stage and the next follow-up (date and optional time, after Done
 * on; empty clears it). Saving sets the inquiry's stage and next
 * follow-up.
 */
export function InquiryFollowUpDialog({
  projectId,
  inquiry,
  open,
  onOpenChange,
  now,
}: {
  projectId: string;
  inquiry: InquiryDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fixed in stories; the device's clock otherwise. */
  now?: Date;
}) {
  const { data: options } = useSuspenseQuery(
    inquiryFormOptionsQuery(projectId),
  );
  const add = useAddFollowUp(inquiry.id);
  const [error, setError] = useState<string | null>(null);
  const fresh = (): Values => {
    const local = nowLocal(now);
    return {
      activity: "call",
      doneOnDate: local.date,
      doneOnTime: local.time,
      remarks: "",
      toStageId: "",
      nextFollowUpDate: "",
      nextFollowUpTime: "",
    };
  };
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: fresh(),
  });
  const errors = form.formState.errors;
  const stages = options.funnelStages
    .filter((stage) => stage.id !== inquiry.funnelStage?.id)
    .map((stage) => ({ value: stage.id, label: stage.name }));

  const close = () => {
    form.reset(fresh());
    setError(null);
    onOpenChange(false);
  };

  const submit = form.handleSubmit(async (input) => {
    setError(null);
    const orNull = (value: string) =>
      value.trim() === "" ? null : value.trim();
    try {
      await add.mutateAsync({
        activity: input.activity as FollowUpActivity,
        doneOnDate: input.doneOnDate,
        doneOnTime: input.doneOnTime,
        remarks: orNull(input.remarks),
        toStageId: orNull(input.toStageId),
        nextFollowUpDate: orNull(input.nextFollowUpDate),
        nextFollowUpTime:
          orNull(input.nextFollowUpDate) == null
            ? null
            : orNull(input.nextFollowUpTime),
      });
      close();
    } catch (caught) {
      if (caught instanceof QueryHttpError) {
        if (DATE_CODES.has(caught.code)) {
          form.setError("doneOnDate", { message: caught.message });
          return;
        }
        const raw = (caught.details as { field?: unknown } | undefined)?.field;
        const field = typeof raw === "string" ? SERVER_FIELDS[raw] : undefined;
        if (field != null) form.setError(field, { message: caught.message });
        else setError(caught.message);
        return;
      }
      setError("Something went wrong. Please try again.");
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="max-h-[90dvh] grid-cols-1 overflow-y-auto sm:max-w-lg">
        <form
          noValidate
          aria-label="Add follow-up"
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>Add follow-up</DialogTitle>
            <DialogDescription className="break-words">
              {`What happened with ${inquiry.name}, and when to follow up next.`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="follow-up-activity" required>
                Activity
              </Label>
              <Controller
                control={form.control}
                name="activity"
                render={({ field }) => (
                  <InquirySelect
                    id="follow-up-activity"
                    value={field.value}
                    onChange={field.onChange}
                    invalid={errors.activity != null}
                    items={FOLLOW_UP_ACTIVITIES.map((key) => ({
                      value: key,
                      label: FOLLOW_UP_ACTIVITY_LABELS[key],
                    }))}
                  />
                )}
              />
              <FieldError message={errors.activity?.message} />
            </div>
            <fieldset className="min-w-0 space-y-1.5 sm:col-span-2">
              <legend className="text-sm leading-none font-medium">
                Done on
                <RequiredIndicator />
              </legend>
              <div className="mt-1.5 grid grid-cols-[1fr_7rem] gap-2">
                <Input
                  type="date"
                  aria-label="Done on date"
                  max={nowLocal(now).date}
                  aria-required
                  aria-invalid={errors.doneOnDate != null}
                  {...form.register("doneOnDate")}
                />
                <Input
                  type="time"
                  aria-label="Done on time"
                  aria-required
                  aria-invalid={errors.doneOnTime != null}
                  {...form.register("doneOnTime")}
                />
              </div>
              <FieldError
                message={
                  errors.doneOnDate?.message ?? errors.doneOnTime?.message
                }
              />
            </fieldset>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="follow-up-remarks">Remarks</Label>
              <Textarea
                id="follow-up-remarks"
                rows={3}
                placeholder="What was said, what they want"
                aria-invalid={errors.remarks != null}
                {...form.register("remarks")}
              />
              <FieldError message={errors.remarks?.message} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="follow-up-stage">Move to stage</Label>
              <Controller
                control={form.control}
                name="toStageId"
                render={({ field }) => (
                  <InquirySelect
                    id="follow-up-stage"
                    value={field.value}
                    onChange={field.onChange}
                    noneLabel={`Keep at ${inquiry.funnelStage?.name ?? "its stage"}`}
                    invalid={errors.toStageId != null}
                    items={stages}
                  />
                )}
              />
              <FieldError message={errors.toStageId?.message} />
            </div>
            <fieldset className="min-w-0 space-y-1.5 sm:col-span-2">
              <legend className="text-sm leading-none font-medium">
                Next follow-up
              </legend>
              <div className="mt-1.5 grid grid-cols-[1fr_7rem] gap-2">
                <Input
                  type="date"
                  aria-label="Next follow-up date"
                  aria-invalid={errors.nextFollowUpDate != null}
                  {...form.register("nextFollowUpDate")}
                />
                <Input
                  type="time"
                  aria-label="Next follow-up time"
                  {...form.register("nextFollowUpTime")}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Leave it empty if no follow-up is planned.
              </p>
              <FieldError message={errors.nextFollowUpDate?.message} />
            </fieldset>
          </div>
          <FormAlert message={error ?? undefined} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
