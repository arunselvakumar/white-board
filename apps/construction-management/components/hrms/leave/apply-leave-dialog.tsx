"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  LEAVE_SESSION_LABELS,
  LEAVE_SESSIONS,
  type LeaveSession,
} from "@/src/hrms/domain/leave-request";
import {
  LEAVE_KEY,
  previewLeave,
  useLeaveCommand,
  type LeaveOptions,
  type LeaveRequestModel,
} from "@/src/queries/hrms-leave";
import { QueryHttpError } from "@/src/queries/http";

import { formatDay, formatDays } from "./leave-format";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const schema = z
  .object({
    memberId: z.string(),
    leaveTypeId: z.string().min(1, "Choose a leave type"),
    fromDate: z.string().regex(DATE_RE, "Choose the first day"),
    toDate: z.string().regex(DATE_RE, "Choose the last day"),
    sessions: z.record(z.string(), z.enum(LEAVE_SESSIONS)),
    reason: z
      .string()
      .trim()
      .min(10, "Write a reason of at least 10 characters")
      .max(1000),
  })
  .refine((values) => values.toDate >= values.fromDate, {
    path: ["toDate"],
    message: "The last day cannot be before the first day",
  });

type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  LEAVE_REASON_TOO_SHORT: "reason",
  LEAVE_REASON_TOO_LONG: "reason",
  LEAVE_TYPE_NOT_FOUND: "leaveTypeId",
  LEAVE_TYPE_INACTIVE: "leaveTypeId",
  LEAVE_BALANCE_INSUFFICIENT: "leaveTypeId",
  LEAVE_DATE_INVALID: "fromDate",
  LEAVE_NO_WORKING_DAYS: "fromDate",
  LEAVE_OVERLAPS: "fromDate",
  BACKDATED_CREATE_BLOCKED: "fromDate",
  FINANCIAL_PERIOD_CLOSED: "fromDate",
  MONTH_LOCKED: "fromDate",
  LEAVE_TO_BEFORE_FROM: "toDate",
  LEAVE_RANGE_TOO_LONG: "toDate",
  LEAVE_SPANS_YEARS: "toDate",
  LEAVE_MAX_CONSECUTIVE_EXCEEDED: "toDate",
  LEAVE_MEMBER_NOT_FOUND: "memberId",
};

function ChoiceSelect({
  id,
  label,
  items,
  value,
  onChange,
  invalid,
}: {
  id: string;
  label: string;
  items: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  return (
    <Select
      items={items}
      value={value === "" ? null : value}
      onValueChange={(next) => {
        if (next != null) onChange(next);
      }}
    >
      <SelectTrigger
        id={id}
        size="lg"
        className="w-full min-w-0"
        aria-invalid={invalid}
      >
        <SelectValue placeholder="Choose" />
      </SelectTrigger>
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        aria-label={label}
      >
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Apply Leave (CM-313): the leave type, the first and last day, each
 * working day as a Full day, Morning or Afternoon (holidays and week offs
 * are left out), the total and the live balance, and a reason. A manager
 * with View All may apply for another Team Member.
 */
export function ApplyLeaveDialog({
  open,
  options,
  today,
  onClose,
  onApplied,
}: {
  open: boolean;
  options: LeaveOptions;
  today: string;
  onClose: () => void;
  onApplied?: (leave: LeaveRequestModel) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Apply Leave</DialogTitle>
          <DialogDescription>
            Holidays and week offs are not counted. Leave that needs approval
            waits for an approver.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <ApplyForm
            options={options}
            today={today}
            onDone={(leave) => {
              onClose();
              onApplied?.(leave);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ApplyForm({
  options,
  today,
  onDone,
}: {
  options: LeaveOptions;
  today: string;
  onDone: (leave: LeaveRequestModel) => void;
}) {
  const command = useLeaveCommand();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      memberId: options.me?.memberId ?? "",
      leaveTypeId: options.leaveTypes[0]?.id ?? "",
      fromDate: today,
      toDate: today,
      sessions: {},
      reason: "",
    },
  });
  const { errors } = form.formState;
  const [memberId, leaveTypeId, fromDate, toDate, sessions] = useWatch({
    control: form.control,
    name: ["memberId", "leaveTypeId", "fromDate", "toDate", "sessions"],
  });
  const ready =
    leaveTypeId !== "" &&
    DATE_RE.test(fromDate) &&
    DATE_RE.test(toDate) &&
    toDate >= fromDate;
  const days = Object.entries(sessions)
    .filter(
      ([date, session]) =>
        session !== "full" && date >= fromDate && date <= toDate,
    )
    .map(([date, session]) => ({ date, session }));
  const forOther =
    options.me == null || (memberId !== "" && memberId !== options.me.memberId);
  const preview = useQuery({
    queryKey: [
      ...LEAVE_KEY,
      "preview",
      memberId,
      leaveTypeId,
      fromDate,
      toDate,
      JSON.stringify(days),
    ],
    queryFn: () =>
      previewLeave({
        memberId: forOther ? memberId : null,
        leaveTypeId,
        fromDate,
        toDate,
        days,
      }),
    enabled: ready,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 0,
  });
  const previewError =
    preview.error instanceof QueryHttpError ? preview.error.message : undefined;
  const shown = ready && preview.error == null ? preview.data : undefined;
  const type = options.leaveTypes.find((item) => item.id === leaveTypeId);

  const memberItems = [
    ...(options.me == null
      ? []
      : [{ value: options.me.memberId, label: `${options.me.name} (you)` }]),
    ...options.members
      .filter((member) => member.memberId !== options.me?.memberId)
      .map((member) => ({ value: member.memberId, label: member.name })),
  ];

  const submit = form.handleSubmit(async (values) => {
    try {
      const leave = (await command.mutateAsync({
        kind: "apply",
        input: {
          memberId: forOther ? values.memberId : null,
          leaveTypeId: values.leaveTypeId,
          fromDate: values.fromDate,
          toDate: values.toDate,
          days,
          reason: values.reason.trim(),
        },
      })) as LeaveRequestModel;
      onDone(leave);
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      {options.permissions.applyForOthers ? (
        <div className="space-y-1.5">
          <Label htmlFor="apply-leave-member">Team Member</Label>
          <Controller
            name="memberId"
            control={form.control}
            render={({ field }) => (
              <ChoiceSelect
                id="apply-leave-member"
                label="Team Members"
                items={memberItems}
                value={field.value}
                onChange={field.onChange}
                invalid={errors.memberId != null}
              />
            )}
          />
          <FieldError message={errors.memberId?.message} />
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="apply-leave-type">Leave type</Label>
        <Controller
          name="leaveTypeId"
          control={form.control}
          render={({ field }) => (
            <ChoiceSelect
              id="apply-leave-type"
              label="Leave types"
              items={options.leaveTypes.map((item) => ({
                value: item.id,
                label: item.isPaid ? item.name : `${item.name} (unpaid)`,
              }))}
              value={field.value}
              onChange={field.onChange}
              invalid={errors.leaveTypeId != null}
            />
          )}
        />
        <FieldError message={errors.leaveTypeId?.message} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="apply-leave-from">From</Label>
          <Input
            id="apply-leave-from"
            type="date"
            className="h-10"
            aria-invalid={errors.fromDate != null}
            {...form.register("fromDate", {
              onChange: (event: { target: { value: string } }) => {
                if (form.getValues("toDate") < event.target.value)
                  form.setValue("toDate", event.target.value);
              },
            })}
          />
          <FieldError message={errors.fromDate?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="apply-leave-to">To</Label>
          <Input
            id="apply-leave-to"
            type="date"
            className="h-10"
            min={fromDate}
            aria-invalid={errors.toDate != null}
            {...form.register("toDate")}
          />
          <FieldError message={errors.toDate?.message} />
        </div>
      </div>

      <section
        aria-label="Day breakdown"
        className="space-y-2 rounded-lg border p-3"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium">Day breakdown</h3>
          <p className="text-sm" aria-live="polite">
            Total leave:{" "}
            <span className="font-semibold tabular-nums">
              {shown == null ? "—" : formatDays(shown.total)}
            </span>
          </p>
        </div>
        {previewError != null ? (
          <p className="text-destructive text-sm">{previewError}</p>
        ) : shown == null ? (
          <p className="text-muted-foreground text-sm">
            Choose a leave type and dates to see the days.
          </p>
        ) : (
          <>
            <ul className="divide-y">
              {shown.days.map((day) => (
                <li
                  key={day.date}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span className="text-sm">{formatDay(day.date)}</span>
                  <Controller
                    name="sessions"
                    control={form.control}
                    render={({ field }) => (
                      <ToggleGroup
                        aria-label={`Session on ${formatDay(day.date)}`}
                        value={[field.value[day.date] ?? "full"]}
                        onValueChange={(next: string[]) => {
                          const session = next[0] as LeaveSession | undefined;
                          if (session == null) return;
                          field.onChange({
                            ...field.value,
                            [day.date]: session,
                          });
                        }}
                        variant="outline"
                        size="sm"
                      >
                        {LEAVE_SESSIONS.map((session) => (
                          <ToggleGroupItem key={session} value={session}>
                            {LEAVE_SESSION_LABELS[session]}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    )}
                  />
                </li>
              ))}
            </ul>
            {shown.skipped.length > 0 ? (
              <p className="text-muted-foreground text-xs">
                Not counted:{" "}
                {shown.skipped
                  .map(
                    (day) =>
                      `${formatDay(day.date)} (${day.kind === "holiday" ? "holiday" : "week off"})`,
                  )
                  .join(", ")}
              </p>
            ) : null}
          </>
        )}
      </section>

      {shown != null ? (
        <div
          className="bg-muted/40 rounded-lg p-3 text-sm"
          aria-label="Leave balance"
          role="group"
        >
          {shown.balance == null ? (
            <p>{type?.name ?? "This leave"} is unpaid and needs no balance.</p>
          ) : (
            <p>
              Balance:{" "}
              <span className="font-semibold">
                {formatDays(shown.balance.available)}
              </span>{" "}
              available
              {shown.balance.pending > 0
                ? ` (${formatDays(shown.balance.pending)} waiting for approval)`
                : ""}
              {" · "}
              after this request{" "}
              <span className="font-semibold">
                {formatDays(shown.balance.available - shown.total)}
              </span>
            </p>
          )}
          {shown.problem != null ? (
            <p className="text-destructive mt-1">{shown.problem.message}</p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="apply-leave-reason">Reason</Label>
        <Textarea
          id="apply-leave-reason"
          rows={3}
          aria-invalid={errors.reason != null}
          {...form.register("reason")}
        />
        <FieldError message={errors.reason?.message} />
      </div>
      <FormAlert message={errors.root?.message} />
      <DialogFooter>
        <Button type="submit" disabled={command.isPending}>
          {command.isPending ? "Applying…" : "Apply"}
        </Button>
      </DialogFooter>
    </form>
  );
}
