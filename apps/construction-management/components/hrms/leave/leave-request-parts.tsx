"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
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
import { Label } from "@repo/ui/components/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { LEAVE_SESSION_LABELS } from "@/src/hrms/domain/leave-request";
import {
  useLeaveCommand,
  type LeaveRequestModel,
} from "@/src/queries/hrms-leave";

import {
  formatDate,
  formatDay,
  formatDays,
  formatRange,
  STATUS_LABELS,
  statusVariant,
} from "./leave-format";

function decisionText(
  decision: LeaveRequestModel["decisions"][number],
): string {
  const what =
    decision.stage === "cancellation"
      ? decision.outcome === "approved"
        ? "Cancellation approved"
        : "Cancellation refused"
      : decision.outcome === "approved"
        ? "Approved"
        : "Rejected";
  const who = decision.deciderName == null ? "" : ` by ${decision.deciderName}`;
  const note = decision.remarks == null ? "" : ` — ${decision.remarks}`;
  return `${what}${who} on ${formatDate(decision.decidedAt.slice(0, 10))}${note}`;
}

export function StatusBadge({
  status,
}: {
  status: LeaveRequestModel["status"];
}) {
  return <Badge variant={statusVariant(status)}>{STATUS_LABELS[status]}</Badge>;
}

/** One request as a row: who (optional), type, dates, days, status, actions. */
export function LeaveRequestRow({
  leave,
  showMember,
  onOpen,
  actions,
}: {
  leave: LeaveRequestModel;
  showMember: boolean;
  onOpen?: () => void;
  actions?: ReactNode;
}) {
  const summary = (
    <div className="min-w-0 flex-1 space-y-1 text-left">
      <p className="truncate font-medium">
        {showMember ? `${leave.memberName} · ` : ""}
        {leave.leaveTypeName}
      </p>
      <p className="text-muted-foreground text-sm">
        {formatRange(leave.fromDate, leave.toDate)} ·{" "}
        {formatDays(leave.totalDays)}
        {leave.approvalLevels > 1 && leave.status === "pending"
          ? ` · level ${String(leave.currentLevel)} of ${String(leave.approvalLevels)}`
          : ""}
      </p>
      <StatusBadge status={leave.status} />
    </div>
  );
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      {onOpen != null ? (
        <Button
          type="button"
          variant="ghost"
          className="-m-2 h-auto min-w-0 flex-1 justify-start p-2 font-normal whitespace-normal"
          onClick={onOpen}
          aria-label={`${showMember ? `${leave.memberName}, ` : ""}${leave.leaveTypeName}, ${formatRange(leave.fromDate, leave.toDate)}, ${STATUS_LABELS[leave.status]}`}
        >
          {summary}
        </Button>
      ) : (
        summary
      )}
      {actions != null ? (
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">{actions}</div>
      ) : null}
    </li>
  );
}

/** Leave Details: days, reason, decisions, and what you may do now. */
export function LeaveDetailSheet({
  leave,
  onClose,
}: {
  leave: LeaveRequestModel | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={leave != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Leave Details</SheetTitle>
          <SheetDescription>
            {leave == null
              ? ""
              : `${leave.memberName} · ${leave.leaveTypeName}`}
          </SheetDescription>
        </SheetHeader>
        {leave != null ? (
          <div className="space-y-5 px-4 pb-6">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={leave.status} />
              <span className="text-sm">
                {formatRange(leave.fromDate, leave.toDate)} ·{" "}
                {formatDays(leave.totalDays)}
                {leave.isPaid ? "" : " · unpaid"}
              </span>
            </div>
            <section aria-label="Days" className="space-y-1">
              <h3 className="text-sm font-medium">Days</h3>
              <ul className="divide-y rounded-lg border text-sm">
                {leave.days.map((day) => (
                  <li key={day.date} className="flex justify-between px-3 py-2">
                    <span>{formatDay(day.date)}</span>
                    <span className="text-muted-foreground">
                      {LEAVE_SESSION_LABELS[day.session]}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Reason</dt>
                <dd>{leave.reason}</dd>
              </div>
              {leave.appliedByMemberId !== leave.memberId &&
              leave.appliedByName != null ? (
                <div>
                  <dt className="text-muted-foreground">Applied by</dt>
                  <dd>{leave.appliedByName}</dd>
                </div>
              ) : null}
              {leave.approvalRemarks != null ? (
                <div>
                  <dt className="text-muted-foreground">Approval remarks</dt>
                  <dd>{leave.approvalRemarks}</dd>
                </div>
              ) : null}
              {leave.rejectionReason != null ? (
                <div>
                  <dt className="text-muted-foreground">Rejection reason</dt>
                  <dd>{leave.rejectionReason}</dd>
                </div>
              ) : null}
              {leave.cancellationReason != null ? (
                <div>
                  <dt className="text-muted-foreground">Cancellation reason</dt>
                  <dd>{leave.cancellationReason}</dd>
                </div>
              ) : null}
            </dl>
            {leave.decisions.length > 0 ? (
              <section aria-label="Decisions" className="space-y-1">
                <h3 className="text-sm font-medium">Decisions</h3>
                <ul className="space-y-1 text-sm">
                  {leave.decisions.map((decision) => (
                    <li key={`${decision.stage}-${decision.decidedAt}`}>
                      {decisionText(decision)}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <LeaveOwnActions leave={leave} onDone={onClose} />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

const reasonSchema = z.object({
  reason: z.string().trim().min(1, "Say why the leave is cancelled").max(1000),
});

/** Withdraw a pending request, or ask to cancel approved leave with a reason. */
function LeaveOwnActions({
  leave,
  onDone,
}: {
  leave: LeaveRequestModel;
  onDone: () => void;
}) {
  const command = useLeaveCommand();
  const form = useForm<z.infer<typeof reasonSchema>>({
    resolver: zodResolver(reasonSchema),
    defaultValues: { reason: "" },
  });
  const { errors } = form.formState;
  if (!leave.canWithdraw && !leave.canRequestCancellation) return null;

  if (leave.canWithdraw)
    return (
      <div className="space-y-2">
        <FormAlert message={errors.root?.message} />
        <Button
          type="button"
          variant="outline"
          disabled={command.isPending}
          onClick={() => {
            command.mutate(
              {
                kind: "withdraw",
                id: leave.id,
                expectedUpdatedAt: leave.updatedAt,
              },
              {
                onSuccess: onDone,
                onError: (error) => {
                  form.setError("root", {
                    message: fieldForCode(error, {}).message,
                  });
                },
              },
            );
          }}
        >
          {command.isPending ? "Withdrawing…" : "Withdraw request"}
        </Button>
      </div>
    );

  const submit = form.handleSubmit(async (values) => {
    try {
      await command.mutateAsync({
        kind: "request-cancellation",
        id: leave.id,
        expectedUpdatedAt: leave.updatedAt,
        reason: values.reason.trim(),
      });
      onDone();
    } catch (error) {
      const { field, message } = fieldForCode(error, {
        LEAVE_CANCELLATION_REASON_REQUIRED: "reason",
      } as const);
      form.setError(field ?? "root", { message });
    }
  });

  return (
    <form
      noValidate
      className="space-y-2 rounded-lg border p-3"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <Label htmlFor="leave-cancel-reason">Cancellation reason</Label>
      <Textarea
        id="leave-cancel-reason"
        rows={2}
        aria-invalid={errors.reason != null}
        {...form.register("reason")}
      />
      <FieldError message={errors.reason?.message} />
      <p className="text-muted-foreground text-xs">
        Your balance is updated once an approver agrees.
      </p>
      <FormAlert message={errors.root?.message} />
      <Button type="submit" variant="outline" disabled={command.isPending}>
        {command.isPending ? "Sending…" : "Request Cancellation"}
      </Button>
    </form>
  );
}

export type Decision =
  | { kind: "approve" | "reject"; leave: LeaveRequestModel }
  | {
      kind: "approve-cancellation" | "reject-cancellation";
      leave: LeaveRequestModel;
    };

const DECISION_TEXT: Record<
  Decision["kind"],
  { title: string; field: string; required: boolean; submit: string }
> = {
  approve: {
    title: "Approve leave",
    field: "Approval remarks",
    required: false,
    submit: "Approve",
  },
  reject: {
    title: "Reject leave",
    field: "Rejection reason",
    required: true,
    submit: "Reject",
  },
  "approve-cancellation": {
    title: "Approve cancellation",
    field: "Remarks",
    required: false,
    submit: "Approve cancellation",
  },
  "reject-cancellation": {
    title: "Refuse cancellation",
    field: "Reason",
    required: true,
    submit: "Refuse cancellation",
  },
};

/** Approve with remarks, reject with a reason, or decide a cancellation. */
export function LeaveDecisionDialog({
  decision,
  onClose,
}: {
  decision: Decision | null;
  onClose: () => void;
}) {
  const text = decision == null ? null : DECISION_TEXT[decision.kind];
  return (
    <Dialog
      open={decision != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{text?.title ?? "Decide"}</DialogTitle>
          <DialogDescription>
            {decision == null
              ? ""
              : `${decision.leave.memberName} · ${decision.leave.leaveTypeName} · ${formatRange(decision.leave.fromDate, decision.leave.toDate)} (${formatDays(decision.leave.totalDays)})`}
          </DialogDescription>
        </DialogHeader>
        {decision != null && text != null ? (
          <DecisionForm
            key={`${decision.kind}-${decision.leave.id}`}
            decision={decision}
            text={text}
            onDone={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DecisionForm({
  decision,
  text,
  onDone,
}: {
  decision: Decision;
  text: (typeof DECISION_TEXT)[Decision["kind"]];
  onDone: () => void;
}) {
  const command = useLeaveCommand();
  const schema = z.object({
    note: text.required
      ? z
          .string()
          .trim()
          .min(1, `Enter the ${text.field.toLowerCase()}`)
          .max(1000)
      : z.string().trim().max(1000),
  });
  const form = useForm<{ note: string }>({
    resolver: zodResolver(schema),
    defaultValues: { note: "" },
  });
  const { errors } = form.formState;
  const submit = form.handleSubmit(async ({ note }) => {
    const { leave, kind } = decision;
    try {
      await command.mutateAsync(
        kind === "approve" || kind === "approve-cancellation"
          ? {
              kind,
              id: leave.id,
              expectedUpdatedAt: leave.updatedAt,
              remarks: note.trim() === "" ? null : note.trim(),
            }
          : {
              kind,
              id: leave.id,
              expectedUpdatedAt: leave.updatedAt,
              reason: note.trim(),
            },
      );
      onDone();
    } catch (error) {
      const { field, message } = fieldForCode(error, {
        LEAVE_REJECTION_REASON_REQUIRED: "note",
        LEAVE_REMARKS_TOO_LONG: "note",
      } as const);
      form.setError(field ?? "root", { message });
    }
  });
  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      {decision.kind === "approve-cancellation" ||
      decision.kind === "reject-cancellation" ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Cancellation reason: </span>
          {decision.leave.cancellationReason}
        </p>
      ) : (
        <p className="text-sm">
          <span className="text-muted-foreground">Reason: </span>
          {decision.leave.reason}
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="leave-decision-note">
          {text.field}
          {text.required ? "" : " (optional)"}
        </Label>
        <Textarea
          id="leave-decision-note"
          rows={3}
          aria-invalid={errors.note != null}
          {...form.register("note")}
        />
        <FieldError message={errors.note?.message} />
      </div>
      <FormAlert message={errors.root?.message} />
      <DialogFooter>
        <Button
          type="submit"
          variant={text.required ? "destructive" : "default"}
          disabled={command.isPending}
        >
          {command.isPending ? "Saving…" : text.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}
