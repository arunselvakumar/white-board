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
  addHrmsManualAttendance,
} from "@/src/queries/hrms-attendance";

const TIME = /^\d{2}:\d{2}$/;

function schemaFor(today: string) {
  return z
    .object({
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date")
        .refine(
          (date) => date < today,
          "Choose an earlier date. For today, check in and out.",
        ),
      checkInTime: z.string().regex(TIME, "Enter the check-in time"),
      checkOutTime: z.string().regex(TIME, "Enter the check-out time"),
      reason: z
        .string()
        .trim()
        .min(3, "Give a reason (at least 3 characters)")
        .max(500, "Use at most 500 characters"),
    })
    .refine((values) => values.checkInTime !== values.checkOutTime, {
      path: ["checkOutTime"],
      message: "Check-out must differ from check-in",
    });
}

type Values = z.output<ReturnType<typeof schemaFor>>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  ENTRY_DATE_INVALID: "date",
  MANUAL_DATE_NOT_PAST: "date",
  BACKDATED_CREATE_BLOCKED: "date",
  FINANCIAL_PERIOD_CLOSED: "date",
  MONTH_LOCKED: "date",
  CHECK_IN_TIME_INVALID: "checkInTime",
  CHECK_OUT_TIME_INVALID: "checkOutTime",
  ATTENDANCE_OVERLAP: "checkInTime",
  REASON_REQUIRED: "reason",
  REASON_TOO_LONG: "reason",
};

/**
 * Add Backdated Attendance (CM-309): a past day the member worked but did
 * not check in, with the times and a reason. The Back-dated Entry policy
 * for HRMS → Attendance applies; it goes to Attendance Approvals.
 */
export function BackdatedAttendanceDialog({
  today,
  onClose,
}: {
  today: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<Values>({
    resolver: zodResolver(schemaFor(today)),
    defaultValues: {
      date: addDays(today, -1),
      checkInTime: "",
      checkOutTime: "",
      reason: "",
    },
  });
  const errors = form.formState.errors;
  const save = useMutation({ mutationFn: addHrmsManualAttendance });

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
            <DialogTitle>Add Backdated Attendance</DialogTitle>
            <DialogDescription>
              For a past day you worked without checking in. A check-out at or
              before the check-in is on the next day. An approver will check it.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="backdated-date">Date</Label>
              <Input
                id="backdated-date"
                type="date"
                className="h-10"
                max={addDays(today, -1)}
                aria-invalid={errors.date != null}
                {...form.register("date")}
              />
              <FieldError message={errors.date?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="backdated-check-in">Check-in time</Label>
              <Input
                id="backdated-check-in"
                type="time"
                className="h-10"
                aria-invalid={errors.checkInTime != null}
                {...form.register("checkInTime")}
              />
              <FieldError message={errors.checkInTime?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="backdated-check-out">Check-out time</Label>
              <Input
                id="backdated-check-out"
                type="time"
                className="h-10"
                aria-invalid={errors.checkOutTime != null}
                {...form.register("checkOutTime")}
              />
              <FieldError message={errors.checkOutTime?.message} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="backdated-reason">Reason</Label>
              <Textarea
                id="backdated-reason"
                rows={2}
                placeholder="At the client's office all day"
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
