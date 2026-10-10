"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
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
import {
  useLeaveCommand,
  type LeaveStructureModel,
  type LeaveTypeModel,
} from "@/src/queries/hrms-leave";

const DAYS_RE = /^\d{1,3}(\.\d{1,2})?$/;

const schema = z
  .object({
    name: z.string().trim().min(1, "Enter the structure's name").max(80),
    description: z.string().max(500),
    lines: z.array(
      z.object({
        leaveTypeId: z.string(),
        included: z.boolean(),
        days: z.string().trim(),
      }),
    ),
  })
  .superRefine((values, context) => {
    if (!values.lines.some((line) => line.included))
      context.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Choose at least one leave type",
      });
    values.lines.forEach((line, index) => {
      if (line.included && line.days !== "" && !DAYS_RE.test(line.days))
        context.addIssue({
          code: "custom",
          path: ["lines", index, "days"],
          message: "Enter days, like 10 or 7.5",
        });
    });
  });

type Values = z.infer<typeof schema>;

function toValues(
  types: readonly LeaveTypeModel[],
  structure: LeaveStructureModel | null,
): Values {
  const lines = new Map(
    (structure?.lines ?? []).map((line) => [line.leaveTypeId, line]),
  );
  return {
    name: structure?.name ?? "",
    description: structure?.description ?? "",
    lines: types.map((type) => {
      const line = lines.get(type.id);
      return {
        leaveTypeId: type.id,
        included: line != null,
        days: line?.entitlementDays == null ? "" : String(line.entitlementDays),
      };
    }),
  };
}

/**
 * Add or edit a leave structure (CM-311): a name and the leave types it
 * gives, each at its yearly limit unless a different number of days is
 * entered.
 */
export function LeaveStructureDialog({
  structure,
  types,
  open,
  onClose,
}: {
  /** Null adds a new structure. */
  structure: LeaveStructureModel | null;
  /** Leave types to choose from (active ones, plus any already in it). */
  types: readonly LeaveTypeModel[];
  open: boolean;
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
          <DialogTitle>
            {structure == null
              ? "Add leave structure"
              : `Edit ${structure.name}`}
          </DialogTitle>
          <DialogDescription>
            The leave types Team Members on this structure get each year.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <StructureForm
            key={structure?.id ?? "new"}
            structure={structure}
            types={types}
            onDone={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function StructureForm({
  structure,
  types,
  onDone,
}: {
  structure: LeaveStructureModel | null;
  types: readonly LeaveTypeModel[];
  onDone: () => void;
}) {
  const command = useLeaveCommand();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(types, structure),
  });
  const { errors } = form.formState;
  const lines = useWatch({ control: form.control, name: "lines" });

  const submit = form.handleSubmit(async (values) => {
    const input = {
      name: values.name.trim(),
      description:
        values.description.trim() === "" ? null : values.description.trim(),
      lines: values.lines
        .filter((line) => line.included)
        .map((line) => ({
          leaveTypeId: line.leaveTypeId,
          entitlementDays: line.days === "" ? null : Number(line.days),
        })),
    };
    try {
      await command.mutateAsync(
        structure == null
          ? { kind: "create-structure", input }
          : {
              kind: "update-structure",
              id: structure.id,
              input,
              expectedUpdatedAt: structure.updatedAt,
            },
      );
      onDone();
    } catch (error) {
      const { field, message } = fieldForCode(error, {
        LEAVE_STRUCTURE_NAME_REQUIRED: "name",
        LEAVE_STRUCTURE_NAME_TOO_LONG: "name",
        LEAVE_STRUCTURE_NAME_IN_USE: "name",
        LEAVE_STRUCTURE_DESCRIPTION_TOO_LONG: "description",
        LEAVE_STRUCTURE_LINES_REQUIRED: "lines",
        LEAVE_ENTITLEMENT_INVALID: "lines",
      } as const);
      form.setError(field ?? "root", { message });
    }
  });

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="leave-structure-name">Name</Label>
        <Input
          id="leave-structure-name"
          className="h-10"
          aria-invalid={errors.name != null}
          {...form.register("name")}
        />
        <FieldError message={errors.name?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="leave-structure-description">Description</Label>
        <Textarea
          id="leave-structure-description"
          rows={2}
          {...form.register("description")}
        />
        <FieldError message={errors.description?.message} />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Leave types</legend>
        <ul className="divide-y rounded-lg border">
          {types.map((type, index) => {
            const included = lines[index]?.included === true;
            return (
              <li
                key={type.id}
                className="flex flex-wrap items-center gap-3 px-3 py-2.5"
              >
                <Controller
                  name={`lines.${index}.included`}
                  control={form.control}
                  render={({ field }) => (
                    <Checkbox
                      id={`leave-structure-line-${type.id}`}
                      checked={field.value}
                      onCheckedChange={(checked) => {
                        field.onChange(checked);
                      }}
                    />
                  )}
                />
                <Label
                  htmlFor={`leave-structure-line-${type.id}`}
                  className="min-w-0 flex-1"
                >
                  {type.name}
                </Label>
                {included ? (
                  <div className="flex items-center gap-2">
                    <Input
                      inputMode="decimal"
                      className="h-9 w-20"
                      aria-label={`Days of ${type.name}`}
                      placeholder={String(type.yearlyLimit)}
                      aria-invalid={errors.lines?.[index]?.days != null}
                      {...form.register(`lines.${index}.days`)}
                    />
                    <span className="text-muted-foreground text-sm">days</span>
                  </div>
                ) : null}
                <FieldError message={errors.lines?.[index]?.days?.message} />
              </li>
            );
          })}
        </ul>
        <p className="text-muted-foreground text-xs">
          Leave the days empty to use the leave type&apos;s yearly limit.
        </p>
        <FieldError
          message={errors.lines?.message ?? errors.lines?.root?.message}
        />
      </fieldset>
      <FormAlert message={errors.root?.message} />
      <DialogFooter>
        <Button type="submit" disabled={command.isPending}>
          {command.isPending
            ? "Saving…"
            : structure == null
              ? "Add structure"
              : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
