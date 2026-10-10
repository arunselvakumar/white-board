"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Check, ListChecks, X } from "lucide-react";
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
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  HRMS_ATTENDANCE_KEY,
  approveHrmsAttendance,
  hrmsAttendanceApprovalsQuery,
  rejectHrmsAttendance,
  type HrmsAttendanceApprovals,
} from "@/src/queries/hrms-attendance";

import {
  AttendanceRead,
  EntryBadges,
  formatClock,
  formatDuration,
  formatWeekdayDate,
} from "./attendance-parts";
import { HrmsEmpty, HrmsPage } from "./hrms-parts";

type Item = HrmsAttendanceApprovals["items"][number];

const schema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Give a reason (at least 3 characters)")
    .max(500, "Use at most 500 characters"),
});

type Values = z.output<typeof schema>;

function RejectDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { reason: "" },
  });
  const errors = form.formState.errors;
  const save = useMutation({
    mutationFn: (values: Values) =>
      rejectHrmsAttendance(item.entry.id, {
        expectedUpdatedAt: item.entry.updatedAt,
        reason: values.reason,
      }),
  });
  const submit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync(values);
      await queryClient.invalidateQueries({ queryKey: HRMS_ATTENDANCE_KEY });
      onClose();
    } catch (error) {
      const { field, message } = fieldForCode(error, {
        REJECTION_REASON_REQUIRED: "reason" as const,
        REASON_TOO_LONG: "reason" as const,
      });
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
            <DialogTitle>Reject attendance</DialogTitle>
            <DialogDescription>
              {item.member?.name ?? "This Team Member"},{" "}
              {formatWeekdayDate(item.entry.date)}. They will see your reason;
              the hours will not count.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="attendance-reject-reason">Reason</Label>
            <Textarea
              id="attendance-reject-reason"
              rows={3}
              aria-invalid={errors.reason != null}
              {...form.register("reason")}
            />
            <FieldError message={errors.reason?.message} />
          </div>
          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={save.isPending}
            >
              {save.isPending ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ApprovalList() {
  const { data } = useSuspenseQuery(hrmsAttendanceApprovalsQuery);
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState<Item | null>(null);
  const [error, setError] = useState<string | undefined>();
  const approve = useMutation({
    mutationFn: (item: Item) =>
      approveHrmsAttendance(item.entry.id, item.entry.updatedAt),
    onMutate: () => {
      setError(undefined);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: HRMS_ATTENDANCE_KEY });
    },
    onError: async (failure) => {
      setError(fieldForCode(failure, {}).message);
      await queryClient.invalidateQueries({ queryKey: HRMS_ATTENDANCE_KEY });
    },
  });

  if (data.items.length === 0)
    return (
      <HrmsEmpty
        icon={ListChecks}
        title="Nothing to approve"
        description="Back-dated days, missed checkouts and check-ins outside the fence appear here for a decision."
      />
    );

  return (
    <section aria-labelledby="hrms-attendance-pending" className="space-y-3">
      <h3 id="hrms-attendance-pending" className="font-semibold">
        {data.items.length} waiting
      </h3>
      <FormAlert message={error} />
      <ul
        aria-label="Attendance waiting for approval"
        className="bg-card divide-y rounded-xl border"
      >
        {data.items.map((item) => {
          const { entry } = item;
          const name = item.member?.name ?? "Removed Team Member";
          return (
            <li
              key={entry.id}
              aria-label={`${name}, ${entry.date}`}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="font-medium">
                  {name}
                  {item.member?.designationName == null ? null : (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      · {item.member.designationName}
                    </span>
                  )}
                </p>
                <p className="text-sm tabular-nums">
                  {formatWeekdayDate(entry.date)} · In{" "}
                  {formatClock(entry.checkInAt, data.timeZone)}
                  {entry.checkOutAt == null
                    ? " · still open"
                    : ` · Out ${formatClock(entry.checkOutAt, data.timeZone)} · ${formatDuration(new Date(entry.checkOutAt).getTime() - new Date(entry.checkInAt).getTime())}`}
                </p>
                <EntryBadges entry={{ ...entry, approvalStatus: "none" }} />
                {entry.reason == null ? null : (
                  <p className="text-muted-foreground text-sm">
                    “{entry.reason}”
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 sm:flex-none"
                  aria-label={`Reject ${name}, ${entry.date}`}
                  disabled={approve.isPending}
                  onClick={() => {
                    setRejecting(item);
                  }}
                >
                  <X aria-hidden="true" />
                  Reject
                </Button>
                <Button
                  type="button"
                  className="flex-1 sm:flex-none"
                  aria-label={`Approve ${name}, ${entry.date}`}
                  disabled={approve.isPending}
                  onClick={() => {
                    approve.mutate(item);
                  }}
                >
                  <Check aria-hidden="true" />
                  Approve
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {rejecting == null ? null : (
        <RejectDialog
          item={rejecting}
          onClose={() => {
            setRejecting(null);
          }}
        />
      )}
    </section>
  );
}

/**
 * Attendance Approvals (CM-309): back-dated days, missed checkouts and
 * out-of-fence check-ins waiting for a decision; approve, or reject with
 * a reason. Nobody but the Owner sees their own. Menu `hrms.attendance`
 * Approve / Reject.
 */
export function AttendanceApprovalsPage() {
  return (
    <HrmsPage
      title="Attendance Approvals"
      description="Approved hours count toward the day; rejected ones do not."
    >
      <AttendanceRead what="attendance approvals">
        <ApprovalList />
      </AttendanceRead>
    </HrmsPage>
  );
}
