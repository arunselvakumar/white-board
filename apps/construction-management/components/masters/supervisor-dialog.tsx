"use client";

import { normalizeMobile } from "@repo/auth/construction/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
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
import { MobileField } from "@/components/auth/mobile-field";
import { fieldForCode } from "@/lib/server-errors";
import {
  teamMemberOptionsQuery,
  useSupervisorCommand,
  type SupervisorItem,
} from "@/src/queries/masters";

const NONE = "none";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the Supervisor name")
    .max(100, "Use at most 100 characters"),
  mobile: z
    .string()
    .trim()
    .refine((value) => value === "" || normalizeMobile(value) != null, {
      message: "Enter a valid mobile number",
    }),
  teamMemberId: z.string(),
});

type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  SUPERVISOR_NAME_REQUIRED: "name",
  SUPERVISOR_NAME_TOO_LONG: "name",
  SUPERVISOR_NAME_IN_USE: "name",
  MOBILE_INVALID: "mobile",
  SUPERVISOR_TEAM_MEMBER_NOT_FOUND: "teamMemberId",
};

/** The mobile as typed after the +91 shown in the field. */
function mobileInput(mobile: string | null): string {
  if (mobile == null) return "";
  return mobile.startsWith("+91") ? mobile.slice(3) : mobile;
}

/**
 * Add or edit a Supervisor (CM-203): name, an optional mobile, and the Team
 * Member they are, if any. The Team Member picker needs Team Members read;
 * without it the field is not shown and the link is kept as it was.
 */
export function SupervisorDialog({
  supervisor,
  onClose,
}: {
  /** Null to add. */
  supervisor: SupervisorItem | null;
  onClose: () => void;
}) {
  const command = useSupervisorCommand();
  const options = useQuery(teamMemberOptionsQuery);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: supervisor?.name ?? "",
      mobile: mobileInput(supervisor?.mobile ?? null),
      teamMemberId: supervisor?.teamMemberId ?? NONE,
    },
  });
  const errors = form.formState.errors;

  const items = [
    { value: NONE, label: "Not a Team Member" },
    ...(options.data ?? []),
  ];
  // Keep a linked Team Member choosable even if they are not in the options.
  if (
    supervisor?.teamMemberId != null &&
    !items.some((item) => item.value === supervisor.teamMemberId)
  )
    items.push({
      value: supervisor.teamMemberId,
      label: supervisor.teamMemberName ?? "Former Team Member",
    });

  const submit = form.handleSubmit(async (values) => {
    const input = {
      name: values.name,
      mobile: values.mobile === "" ? null : normalizeMobile(values.mobile),
      teamMemberId: values.teamMemberId === NONE ? null : values.teamMemberId,
    };
    try {
      await command.mutateAsync(
        supervisor == null
          ? { kind: "create", input }
          : {
              kind: "update",
              id: supervisor.id,
              input: { ...input, expectedUpdatedAt: supervisor.updatedAt },
            },
      );
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
      <DialogContent className="sm:max-w-xl">
        <form
          noValidate
          className="space-y-5"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {supervisor == null
                ? "Add Supervisor"
                : `Edit ${supervisor.name}`}
            </DialogTitle>
            <DialogDescription>
              The person on site who looks after a group of Labours. They do not
              need to sign in.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="supervisor-name">Supervisor name</Label>
              <Input
                id="supervisor-name"
                className="h-10"
                autoComplete="off"
                placeholder="Rakesh Mirtha"
                aria-invalid={errors.name != null}
                {...form.register("name")}
              />
              <FieldError message={errors.name?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supervisor-mobile">Mobile (optional)</Label>
              <MobileField
                id="supervisor-mobile"
                aria-invalid={errors.mobile != null}
                {...form.register("mobile")}
              />
              <FieldError message={errors.mobile?.message} />
            </div>
            {options.isError ? null : (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="supervisor-team-member">
                  Team Member (optional)
                </Label>
                <Controller
                  name="teamMemberId"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      items={items}
                      value={field.value}
                      onValueChange={(value) => {
                        if (value != null) field.onChange(value);
                      }}
                    >
                      <SelectTrigger
                        id="supervisor-team-member"
                        size="lg"
                        className="w-full min-w-0"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent
                        align="start"
                        alignItemWithTrigger={false}
                        aria-label="Team Members"
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
                <FieldError message={errors.teamMemberId?.message} />
              </div>
            )}
          </div>
          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={command.isPending}>
              {command.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
