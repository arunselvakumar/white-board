"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  HRMS_SHIFTS_KEY,
  assignHrmsShift,
  type HrmsRotationTemplate,
  type HrmsShiftTemplate,
} from "@/src/queries/hrms-shifts";

const schema = z.object({
  kind: z.enum(["shift", "rotation"]),
  templateId: z.string().min(1, "Choose what they work"),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date"),
});

type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  SHIFT_ASSIGNMENT_TEMPLATE_INACTIVE: "templateId",
  SHIFT_ASSIGNMENT_TEMPLATE_REQUIRED: "templateId",
  SHIFT_TEMPLATE_NOT_FOUND: "templateId",
  ROTATION_TEMPLATE_NOT_FOUND: "templateId",
  SHIFT_ASSIGNMENT_DATE_INVALID: "effectiveFrom",
  SHIFT_ASSIGNMENT_BEFORE_LATEST: "effectiveFrom",
  MONTH_LOCKED: "effectiveFrom",
};

/**
 * Assign a shift or a rotation to the chosen Team Members from a date,
 * until changed (CM-307). Whatever they worked before ends the day before.
 */
export function AssignShiftDialog({
  members,
  shifts,
  rotations,
  today,
  onClose,
  onAssigned,
}: {
  members: readonly { memberId: string; name: string }[];
  /** Active shift templates. */
  shifts: readonly HrmsShiftTemplate[];
  /** Active rotation templates. */
  rotations: readonly HrmsRotationTemplate[];
  today: string;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: shifts.length > 0 ? "shift" : "rotation",
      templateId: "",
      effectiveFrom: today,
    },
  });
  const errors = form.formState.errors;
  const kind = useWatch({ control: form.control, name: "kind" });
  const items = (kind === "shift" ? shifts : rotations).map((item) => ({
    value: item.id,
    label: item.name,
  }));
  const assign = useMutation({
    mutationFn: (values: Values) =>
      assignHrmsShift({
        memberIds: members.map((member) => member.memberId),
        shiftTemplateId: values.kind === "shift" ? values.templateId : null,
        rotationTemplateId:
          values.kind === "rotation" ? values.templateId : null,
        effectiveFrom: values.effectiveFrom,
      }),
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      await assign.mutateAsync(values);
      await queryClient.invalidateQueries({ queryKey: HRMS_SHIFTS_KEY });
      onAssigned();
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  });

  const who =
    members.length === 1
      ? (members[0]?.name ?? "1 Team Member")
      : `${String(members.length)} Team Members`;

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
            <DialogTitle>Assign shift</DialogTitle>
            <DialogDescription>
              {who} will work this from the date until it is changed. What they
              worked before ends the day before.
            </DialogDescription>
          </DialogHeader>
          <Controller
            name="kind"
            control={form.control}
            render={({ field }) => (
              <RadioGroup
                aria-label="Shift or rotation"
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value);
                  form.setValue("templateId", "");
                }}
                className="grid grid-cols-2 gap-3"
              >
                {(["shift", "rotation"] as const).map((option) => (
                  <div
                    key={option}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <RadioGroupItem
                      id={`assign-${option}`}
                      value={option}
                      disabled={
                        (option === "shift" ? shifts : rotations).length === 0
                      }
                    />
                    <Label htmlFor={`assign-${option}`}>
                      {option === "shift" ? "A shift" : "A rotation"}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}
          />
          <div className="space-y-1.5">
            <Label htmlFor="assign-template">
              {kind === "shift" ? "Shift" : "Rotation"}
            </Label>
            <Controller
              name="templateId"
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
                    id="assign-template"
                    size="lg"
                    className="w-full min-w-0"
                    aria-invalid={errors.templateId != null}
                  >
                    <SelectValue placeholder="Choose" />
                  </SelectTrigger>
                  <SelectContent
                    align="start"
                    alignItemWithTrigger={false}
                    aria-label={kind === "shift" ? "Shifts" : "Rotations"}
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
            <FieldError message={errors.templateId?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="assign-from">From</Label>
            <Input
              id="assign-from"
              type="date"
              className="h-10"
              aria-describedby="assign-from-hint"
              aria-invalid={errors.effectiveFrom != null}
              {...form.register("effectiveFrom")}
            />
            <p id="assign-from-hint" className="text-muted-foreground text-xs">
              A custom cycle starts its first day on this date.
            </p>
            <FieldError message={errors.effectiveFrom?.message} />
          </div>
          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={assign.isPending}>
              {assign.isPending ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
