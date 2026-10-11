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
import { useLookupCommand, type LookupItem } from "@/src/queries/masters";

import { SKILL_LABELS, type LookupScreenConfig } from "./lookup-screens";

const NAME_MAX = 100;

const SKILLS = [
  { value: "skilled", label: SKILL_LABELS.skilled },
  { value: "unskilled", label: SKILL_LABELS.unskilled },
] as const;

/**
 * Add a row, or rename a Company-made one (with the `updatedAt` it loaded).
 * Labour Categories also set their skill; a Default one keeps its name and
 * changes only its skill.
 */
export function LookupNameDialog({
  config,
  item,
  onClose,
}: {
  config: LookupScreenConfig;
  /** Null to add. */
  item: LookupItem | null;
  onClose: () => void;
}) {
  const schema = z.object({
    name: z
      .string()
      .trim()
      .min(1, `Enter the ${config.singular} name`)
      .max(NAME_MAX, `Use at most ${String(NAME_MAX)} characters`),
    skill: z.enum(["skilled", "unskilled"]),
  });
  const withSkill = config.withSkill === true;
  const nameLocked = item?.isSeed === true;
  type Values = z.infer<typeof schema>;
  const serverFields: Record<string, keyof Values> = {
    [`${config.code}_NAME_REQUIRED`]: "name",
    [`${config.code}_NAME_TOO_LONG`]: "name",
    [`${config.code}_NAME_IN_USE`]: "name",
  };

  const command = useLookupCommand(config.list);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: item?.name ?? "", skill: item?.skill ?? "skilled" },
  });
  const errors = form.formState.errors;

  const submit = form.handleSubmit(async (values) => {
    try {
      const skill = withSkill ? { skill: values.skill } : {};
      await command.mutateAsync(
        item == null
          ? { kind: "create", name: values.name, ...skill }
          : {
              kind: "rename",
              id: item.id,
              name: nameLocked ? item.name : values.name,
              expectedUpdatedAt: item.updatedAt,
              ...skill,
            },
      );
      onClose();
    } catch (error) {
      const { field, message } = fieldForCode(error, serverFields);
      form.setError(field ?? "root", { message });
    }
  });

  const fieldId = `${config.list}-name`;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="space-y-5"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {item == null
                ? `Add ${config.singular}`
                : `${withSkill ? "Edit" : "Rename"} ${item.name}`}
            </DialogTitle>
            <DialogDescription>{config.dialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={fieldId}>{config.singular} name</Label>
            <Input
              id={fieldId}
              className="h-10"
              autoComplete="off"
              placeholder={config.placeholder}
              aria-invalid={errors.name != null}
              readOnly={nameLocked}
              aria-describedby={nameLocked ? `${fieldId}-locked` : undefined}
              {...form.register("name")}
            />
            {nameLocked ? (
              <p
                id={`${fieldId}-locked`}
                className="text-muted-foreground text-xs"
              >
                A Default {config.singular} keeps its name.
              </p>
            ) : null}
            <FieldError message={errors.name?.message} />
          </div>
          {withSkill ? (
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-skill`}>Skill</Label>
              <Controller
                control={form.control}
                name="skill"
                render={({ field }) => (
                  <Select
                    items={SKILLS}
                    value={field.value}
                    onValueChange={(next) => {
                      if (next != null) field.onChange(next);
                    }}
                  >
                    <SelectTrigger
                      id={`${fieldId}-skill`}
                      size="lg"
                      className="w-full min-w-0"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      {SKILLS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-muted-foreground text-xs">
                How its heads count on a Daily Worksheet&apos;s skilled and
                unskilled labour.
              </p>
            </div>
          ) : null}
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
