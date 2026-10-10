"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { addDays } from "@/src/shared-kernel/calendar-date";
import {
  HRMS_ATTENDANCE_KEY,
  addHrmsMissedCheckout,
  type HrmsAttendanceEntry,
} from "@/src/queries/hrms-attendance";

import { formatClock, formatWeekdayDate } from "./attendance-parts";

const schema = z.object({
  checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date"),
  checkOutTime: z.string().regex(/^\d{2}:\d{2}$/, "Enter the time"),
  reason: z
    .string()
    .trim()
    .min(3, "Give a reason (at least 3 characters)")
    .max(500, "Use at most 500 characters"),
});

type Values = z.output<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  CHECK_OUT_DATE_INVALID: "checkOutDate",
  CHECK_OUT_TIME_INVALID: "checkOutTime",
  CHECK_OUT_BEFORE_CHECK_IN: "checkOutTime",
  CHECK_OUT_TOO_LATE: "checkOutTime",
  CHECK_OUT_IN_FUTURE: "checkOutTime",
  ATTENDANCE_OVERLAP: "checkOutTime",
  REASON_REQUIRED: "reason",
  REASON_TOO_LONG: "reason",
};

/**
 * Add Missed Checkout (CM-309): when a check-in was left open on an
 * earlier day, the member says when they left and why. It goes to
 * Attendance Approvals; the hours count once approved.
 */
export function MissedCheckoutDialog({
  entry,
  timeZone,
  onClose,
}: {
  entry: HrmsAttendanceEntry;
  timeZone: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { checkOutDate: entry.date, checkOutTime: "", reason: "" },
  });
  const errors = form.formState.errors;
  const save = useMutation({
    mutationFn: (values: Values) =>
      addHrmsMissedCheckout({
        entryId: entry.id,
        ...values,
        expectedUpdatedAt: entry.updatedAt,
      }),
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync(values);
      await queryClient.invalidateQueries({ queryKey: HRMS_ATTENDANCE_KEY });
      onClose();
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <form
          noValidate
          className="space-y-5"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>Add Missed Checkout</DialogTitle>
            <DialogDescription>
              You checked in on {formatWeekdayDate(entry.date)} at{" "}
              {formatClock(entry.checkInAt, timeZone)} and never checked out.
              Say when you left; an approver will check it.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="missed-checkout-date">Checkout date</Label>
              <Input
                id="missed-checkout-date"
                type="date"
                className="h-10"
                min={entry.date}
                max={addDays(entry.date, 1)}
                aria-invalid={errors.checkOutDate != null}
                {...form.register("checkOutDate")}
              />
              <FieldError message={errors.checkOutDate?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="missed-checkout-time">Checkout time</Label>
              <Input
                id="missed-checkout-time"
                type="time"
                className="h-10"
                aria-invalid={errors.checkOutTime != null}
                {...form.register("checkOutTime")}
              />
              <FieldError message={errors.checkOutTime?.message} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="missed-checkout-reason">Reason</Label>
              <Textarea
                id="missed-checkout-reason"
                rows={2}
                placeholder="Phone switched off at the site"
                aria-invalid={errors.reason != null}
                {...form.register("reason")}
              />
              <FieldError message={errors.reason?.message} />
            </div>
          </div>
          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Sending…" : "Send for approval"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
