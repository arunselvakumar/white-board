"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
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
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  leaveCreditsQuery,
  useLeaveCommand,
  type LeaveCommandResult,
  type LeaveStructureModel,
} from "@/src/queries/hrms-leave";

import { formatDate, formatDays, LEDGER_KIND_LABELS } from "./leave-format";
import { MemberChecklist, type PickableMember } from "./member-checklist";

type Choice = { value: string; label: string };

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
  items: readonly Choice[];
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

// ---------------------------------------------------------------------------
// Initialise
// ---------------------------------------------------------------------------

const initialiseSchema = z
  .object({
    by: z.enum(["members", "structure"]),
    memberIds: z.array(z.string()),
    structureId: z.string(),
  })
  .superRefine((values, context) => {
    if (values.by === "members" && values.memberIds.length === 0)
      context.addIssue({
        code: "custom",
        path: ["memberIds"],
        message: "Choose at least one Team Member",
      });
    if (values.by === "structure" && values.structureId === "")
      context.addIssue({
        code: "custom",
        path: ["structureId"],
        message: "Choose a structure",
      });
  });

type InitialiseValues = z.infer<typeof initialiseSchema>;

/**
 * Initialise balances for a leave year (CM-311): for chosen Team Members
 * or everyone on a structure. Running it again opens nothing twice.
 */
export function InitialiseBalancesDialog({
  open,
  leaveYear,
  members,
  structures,
  onClose,
  onDone,
}: {
  open: boolean;
  leaveYear: string;
  members: readonly PickableMember[];
  structures: readonly LeaveStructureModel[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Initialise balances for {leaveYear}</DialogTitle>
          <DialogDescription>
            Upfront leave is credited in full, monthly leave starts at 0, and
            unused days carry forward where allowed. Balances already open are
            left as they are.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <InitialiseForm
            leaveYear={leaveYear}
            members={members}
            structures={structures}
            onDone={onDone}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function InitialiseForm({
  leaveYear,
  members,
  structures,
  onDone,
}: {
  leaveYear: string;
  members: readonly PickableMember[];
  structures: readonly LeaveStructureModel[];
  onDone: (message: string) => void;
}) {
  const command = useLeaveCommand();
  const form = useForm<InitialiseValues>({
    resolver: zodResolver(initialiseSchema),
    defaultValues: { by: "members", memberIds: [], structureId: "" },
  });
  const { errors } = form.formState;
  const by = useWatch({ control: form.control, name: "by" });

  const submit = form.handleSubmit(async (values) => {
    try {
      const result = (await command.mutateAsync(
        values.by === "members"
          ? { kind: "initialise", memberIds: values.memberIds, leaveYear }
          : {
              kind: "initialise-structure",
              structureId: values.structureId,
              leaveYear,
            },
      )) as Extract<LeaveCommandResult, { initialised: number }>;
      onDone(
        result.initialised === 0 && result.carriedForward === 0
          ? `Balances for ${leaveYear} were already open.`
          : `Opened ${String(result.initialised)} balances for ${String(result.members)} Team Members${result.carriedForward > 0 ? `, ${String(result.carriedForward)} carried forward` : ""}.`,
      );
    } catch (error) {
      const { field, message } = fieldForCode(error, {
        LEAVE_STRUCTURE_NOT_ASSIGNED: "structureId",
        LEAVE_MEMBERS_REQUIRED: "memberIds",
        LEAVE_MEMBER_NOT_FOUND: "memberIds",
      } as const);
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
      <Controller
        name="by"
        control={form.control}
        render={({ field }) => (
          <RadioGroup
            aria-label="Initialise"
            value={field.value}
            onValueChange={(value) => {
              field.onChange(value);
            }}
            className="grid gap-2 sm:grid-cols-2"
          >
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <RadioGroupItem id="leave-init-members" value="members" />
              <Label htmlFor="leave-init-members">Chosen Team Members</Label>
            </div>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <RadioGroupItem
                id="leave-init-structure"
                value="structure"
                disabled={structures.length === 0}
              />
              <Label htmlFor="leave-init-structure">
                Everyone on a structure
              </Label>
            </div>
          </RadioGroup>
        )}
      />
      {by === "members" ? (
        <div className="space-y-1.5">
          <Controller
            name="memberIds"
            control={form.control}
            render={({ field }) => (
              <MemberChecklist
                idPrefix="leave-init-member"
                members={members}
                value={field.value}
                onChange={field.onChange}
                invalid={errors.memberIds != null}
              />
            )}
          />
          <FieldError message={errors.memberIds?.message} />
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="leave-init-structure-id">Structure</Label>
          <Controller
            name="structureId"
            control={form.control}
            render={({ field }) => (
              <ChoiceSelect
                id="leave-init-structure-id"
                label="Structures"
                items={structures.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
                value={field.value}
                onChange={field.onChange}
                invalid={errors.structureId != null}
              />
            )}
          />
          <FieldError message={errors.structureId?.message} />
        </div>
      )}
      <FormAlert message={errors.root?.message} />
      <DialogFooter>
        <Button type="submit" disabled={command.isPending}>
          {command.isPending ? "Initialising…" : "Initialise"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Adjust (Comp Off)
// ---------------------------------------------------------------------------

const adjustSchema = z.object({
  memberId: z.string().min(1, "Choose a Team Member"),
  leaveTypeId: z.string().min(1, "Choose a leave type"),
  days: z
    .string()
    .trim()
    .regex(/^-?\d{1,3}(\.\d{1,2})?$/, "Enter days, like 1 or -0.5")
    .refine((value) => Number(value) !== 0, "Enter days other than 0"),
  reason: z.string().trim().min(3, "Say why the balance is adjusted").max(500),
});

type AdjustValues = z.infer<typeof adjustSchema>;

/**
 * Adjust a balance with a reason (CM-311): credit Compensatory Off for a
 * worked holiday (ADR CM-0012 §9), or correct a balance with a negative
 * number.
 */
export function AdjustBalanceDialog({
  open,
  leaveYear,
  members,
  leaveTypes,
  initialMemberId,
  onClose,
  onDone,
}: {
  open: boolean;
  leaveYear: string;
  members: readonly PickableMember[];
  leaveTypes: readonly { id: string; name: string }[];
  initialMemberId: string | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adjust balance</DialogTitle>
          <DialogDescription>
            Credit Compensatory Off for a worked holiday, or correct a balance
            for {leaveYear}. Every adjustment keeps its reason.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <AdjustForm
            leaveYear={leaveYear}
            members={members}
            leaveTypes={leaveTypes}
            initialMemberId={initialMemberId}
            onDone={onDone}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AdjustForm({
  leaveYear,
  members,
  leaveTypes,
  initialMemberId,
  onDone,
}: {
  leaveYear: string;
  members: readonly PickableMember[];
  leaveTypes: readonly { id: string; name: string }[];
  initialMemberId: string | null;
  onDone: (message: string) => void;
}) {
  const command = useLeaveCommand();
  const compOff = leaveTypes.find((type) => type.name === "Compensatory Off");
  const form = useForm<AdjustValues>({
    resolver: zodResolver(adjustSchema),
    defaultValues: {
      memberId: initialMemberId ?? "",
      leaveTypeId: compOff?.id ?? "",
      days: "1",
      reason: "",
    },
  });
  const { errors } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    try {
      await command.mutateAsync({
        kind: "adjust",
        input: {
          memberId: values.memberId,
          leaveTypeId: values.leaveTypeId,
          leaveYear,
          days: Number(values.days),
          reason: values.reason.trim(),
        },
      });
      const member = members.find((item) => item.memberId === values.memberId);
      const type = leaveTypes.find((item) => item.id === values.leaveTypeId);
      onDone(
        `${Number(values.days) > 0 ? "Credited" : "Took away"} ${formatDays(Math.abs(Number(values.days)))} of ${type?.name ?? "leave"} for ${member?.name ?? "the Team Member"}.`,
      );
    } catch (error) {
      const { field, message } = fieldForCode(error, {
        LEAVE_ADJUSTMENT_DAYS_INVALID: "days",
        LEAVE_ADJUSTMENT_BELOW_ZERO: "days",
        LEAVE_ADJUSTMENT_REASON_REQUIRED: "reason",
        LEAVE_ADJUSTMENT_REASON_TOO_LONG: "reason",
        LEAVE_MEMBER_NOT_FOUND: "memberId",
        LEAVE_TYPE_NOT_FOUND: "leaveTypeId",
      } as const);
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
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="leave-adjust-member">Team Member</Label>
          <Controller
            name="memberId"
            control={form.control}
            render={({ field }) => (
              <ChoiceSelect
                id="leave-adjust-member"
                label="Team Members"
                items={members.map((item) => ({
                  value: item.memberId,
                  label: item.name,
                }))}
                value={field.value}
                onChange={field.onChange}
                invalid={errors.memberId != null}
              />
            )}
          />
          <FieldError message={errors.memberId?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="leave-adjust-type">Leave type</Label>
          <Controller
            name="leaveTypeId"
            control={form.control}
            render={({ field }) => (
              <ChoiceSelect
                id="leave-adjust-type"
                label="Leave types"
                items={leaveTypes.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
                value={field.value}
                onChange={field.onChange}
                invalid={errors.leaveTypeId != null}
              />
            )}
          />
          <FieldError message={errors.leaveTypeId?.message} />
        </div>
      </div>
      <div className="space-y-1.5 sm:w-1/2">
        <Label htmlFor="leave-adjust-days">Days</Label>
        <Input
          id="leave-adjust-days"
          inputMode="decimal"
          className="h-10"
          aria-describedby="leave-adjust-days-hint"
          aria-invalid={errors.days != null}
          {...form.register("days")}
        />
        <p
          id="leave-adjust-days-hint"
          className="text-muted-foreground text-xs"
        >
          A negative number takes days away; a balance never goes below 0.
        </p>
        <FieldError message={errors.days?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="leave-adjust-reason">Reason</Label>
        <Textarea
          id="leave-adjust-reason"
          rows={2}
          placeholder="Worked on Sunday 4 Oct"
          aria-invalid={errors.reason != null}
          {...form.register("reason")}
        />
        <FieldError message={errors.reason?.message} />
      </div>
      <FormAlert message={errors.root?.message} />
      <DialogFooter>
        <Button type="submit" disabled={command.isPending}>
          {command.isPending ? "Saving…" : "Save adjustment"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Credit history
// ---------------------------------------------------------------------------

/** A member's credits for a leave year: opening, monthly, carried forward, adjusted. */
export function CreditHistorySheet({
  member,
  leaveYear,
  onClose,
}: {
  /** Null closes it; `memberId` null is yourself. */
  member: { memberId: string | null; name: string } | null;
  leaveYear: string | undefined;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={member != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Credit history</SheetTitle>
          <SheetDescription>
            {member?.name ?? ""}
            {leaveYear != null ? ` · ${leaveYear}` : ""}
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {member != null ? (
            <Suspense
              fallback={
                <div className="space-y-2" aria-busy="true">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              }
            >
              <CreditList memberId={member.memberId} leaveYear={leaveYear} />
            </Suspense>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CreditList({
  memberId,
  leaveYear,
}: {
  memberId: string | null;
  leaveYear: string | undefined;
}) {
  const { data } = useSuspenseQuery(
    leaveCreditsQuery(memberId ?? undefined, leaveYear),
  );
  if (data.items.length === 0)
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
        No credits in {data.leaveYear} yet. Balances are opened by initialising
        them.
      </p>
    );
  return (
    <ul aria-label="Credits" className="divide-y rounded-xl border">
      {data.items.map((entry) => (
        <li key={entry.id} className="flex items-start gap-3 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{entry.leaveTypeName}</p>
            <p className="text-muted-foreground text-xs">
              {LEDGER_KIND_LABELS[entry.kind] ?? entry.kind} ·{" "}
              {formatDate(entry.entryDate)}
              {entry.reason != null ? ` · ${entry.reason}` : ""}
            </p>
          </div>
          <span className="tabular-nums">
            {entry.days > 0 ? "+" : ""}
            {formatDays(entry.days)}
          </span>
        </li>
      ))}
    </ul>
  );
}
