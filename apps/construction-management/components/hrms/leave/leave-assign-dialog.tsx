"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
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

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  useLeaveCommand,
  type LeaveStructureModel,
} from "@/src/queries/hrms-leave";

import { MemberChecklist, type PickableMember } from "./member-checklist";

const schema = z.object({
  structureId: z.string().min(1, "Choose a structure"),
  memberIds: z.array(z.string()).min(1, "Choose at least one Team Member"),
  effectiveFrom: z.iso.date("Choose the date it applies from"),
});

type Values = z.infer<typeof schema>;

/**
 * Assign a leave structure to Team Members from a date (CM-311). The
 * latest assignment on or before a day is the one in force.
 */
export function LeaveAssignDialog({
  open,
  structures,
  members,
  initialStructureId,
  today,
  onClose,
}: {
  open: boolean;
  structures: readonly LeaveStructureModel[];
  members: readonly PickableMember[];
  initialStructureId: string | null;
  today: string;
  onClose: () => void;
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
          <DialogTitle>Assign structure</DialogTitle>
          <DialogDescription>
            Team Members get the structure&apos;s leave from this date until
            another structure is assigned.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <AssignForm
            structures={structures}
            members={members}
            initialStructureId={initialStructureId}
            today={today}
            onDone={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AssignForm({
  structures,
  members,
  initialStructureId,
  today,
  onDone,
}: {
  structures: readonly LeaveStructureModel[];
  members: readonly PickableMember[];
  initialStructureId: string | null;
  today: string;
  onDone: () => void;
}) {
  const command = useLeaveCommand();
  const items = structures.map((item) => ({
    value: item.id,
    label: item.name,
  }));
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      structureId: initialStructureId ?? structures[0]?.id ?? "",
      memberIds: [],
      effectiveFrom: `${today.slice(0, 4)}-01-01`,
    },
  });
  const { errors } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    try {
      await command.mutateAsync({ kind: "assign", ...values });
      onDone();
    } catch (error) {
      const { field, message } = fieldForCode(error, {
        LEAVE_ASSIGNMENT_EXISTS: "effectiveFrom",
        LEAVE_ASSIGNMENT_DATE_INVALID: "effectiveFrom",
        LEAVE_ASSIGNMENT_MEMBERS_REQUIRED: "memberIds",
        TEAM_MEMBER_NOT_FOUND: "memberIds",
        LEAVE_STRUCTURE_NOT_FOUND: "structureId",
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
          <Label htmlFor="leave-assign-structure">Structure</Label>
          <Controller
            name="structureId"
            control={form.control}
            render={({ field }) => (
              <Select
                items={items}
                value={field.value === "" ? null : field.value}
                onValueChange={(value) => {
                  if (value != null) field.onChange(value);
                }}
              >
                <SelectTrigger
                  id="leave-assign-structure"
                  size="lg"
                  className="w-full min-w-0"
                  aria-invalid={errors.structureId != null}
                >
                  <SelectValue placeholder="Choose" />
                </SelectTrigger>
                <SelectContent
                  align="start"
                  alignItemWithTrigger={false}
                  aria-label="Structures"
                >
                  {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError message={errors.structureId?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="leave-assign-from">Applies from</Label>
          <Input
            id="leave-assign-from"
            type="date"
            className="h-10"
            aria-invalid={errors.effectiveFrom != null}
            {...form.register("effectiveFrom")}
          />
          <FieldError message={errors.effectiveFrom?.message} />
        </div>
      </div>
      <div className="space-y-1.5">
        <span className="text-sm font-medium">Team Members</span>
        <Controller
          name="memberIds"
          control={form.control}
          render={({ field }) => (
            <MemberChecklist
              idPrefix="leave-assign-member"
              members={members}
              value={field.value}
              onChange={field.onChange}
              invalid={errors.memberIds != null}
            />
          )}
        />
        <FieldError message={errors.memberIds?.message} />
      </div>
      <FormAlert message={errors.root?.message} />
      <DialogFooter>
        <Button type="submit" disabled={command.isPending}>
          {command.isPending ? "Assigning…" : "Assign"}
        </Button>
      </DialogFooter>
    </form>
  );
}
