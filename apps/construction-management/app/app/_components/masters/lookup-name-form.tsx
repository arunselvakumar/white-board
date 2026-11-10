"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
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

const schema = z.object({
  name: z.string(),
  skill: z.enum(["skilled", "unskilled"]),
});

type Values = z.infer<typeof schema>;

export type LookupNameForm = {
  form: UseFormReturn<Values>;
  submit: (event?: React.BaseSyntheticEvent) => Promise<void>;
  saving: boolean;
  config: LookupScreenConfig;
  nameLocked: boolean;
};

/**
 * Add a row, or rename a Company-made one (with the `updatedAt` it loaded).
 * Labour Categories also set their skill; a Default one keeps its name and
 * changes only its skill. `onSaved` gets the saved row. Shared by the
 * Masters dialog and the Add Labour Category slide-over on the Labour form.
 */
export function useLookupNameForm({
  config,
  item,
  onSaved,
}: {
  config: LookupScreenConfig;
  /** Null to add. */
  item: LookupItem | null;
  onSaved: (saved: LookupItem | undefined) => void;
}): LookupNameForm {
  const nameLocked = item?.isSeed === true;
  const withSkill = config.withSkill === true;
  const serverFields: Record<string, keyof Values> = {
    [`${config.code}_NAME_REQUIRED`]: "name",
    [`${config.code}_NAME_TOO_LONG`]: "name",
    [`${config.code}_NAME_IN_USE`]: "name",
  };

  const command = useLookupCommand(config.list);
  const form = useForm<Values>({
    resolver: zodResolver(
      schema.extend({
        name: z
          .string()
          .trim()
          .min(1, `Enter the ${config.singular} name`)
          .max(NAME_MAX, `Use at most ${String(NAME_MAX)} characters`),
      }),
    ),
    defaultValues: { name: item?.name ?? "", skill: item?.skill ?? "skilled" },
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      const skill = withSkill ? { skill: values.skill } : {};
      const saved = await command.mutateAsync(
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
      onSaved(saved);
    } catch (error) {
      const { field, message } = fieldForCode(error, serverFields);
      form.setError(field ?? "root", { message });
    }
  });

  return { form, submit, saving: command.isPending, config, nameLocked };
}

/** The name (and, for Labour Categories, skill) fields and the form error. */
export function LookupNameFields({
  lookup,
  idPrefix,
}: {
  lookup: LookupNameForm;
  /** Keeps ids unique when the Masters dialog and a slide-over coexist. */
  idPrefix?: string;
}) {
  const { form, config, nameLocked } = lookup;
  const errors = form.formState.errors;
  const fieldId = `${idPrefix ?? ""}${config.list}-name`;
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={fieldId} required>
          {config.singular} name
        </Label>
        <Input
          id={fieldId}
          className="h-10"
          autoComplete="off"
          aria-required
          placeholder={config.placeholder}
          aria-invalid={errors.name != null}
          readOnly={nameLocked}
          aria-describedby={nameLocked ? `${fieldId}-locked` : undefined}
          {...form.register("name")}
        />
        {nameLocked ? (
          <p id={`${fieldId}-locked`} className="text-muted-foreground text-xs">
            A Default {config.singular} keeps its name.
          </p>
        ) : null}
        <FieldError message={errors.name?.message} />
      </div>
      {config.withSkill === true ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-skill`} required>
            Skill
          </Label>
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
                  className="w-full min-w-0"
                  aria-required
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
    </>
  );
}
