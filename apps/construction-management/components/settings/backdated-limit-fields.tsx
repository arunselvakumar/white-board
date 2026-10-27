"use client";

import {
  Controller,
  type Control,
  type FieldErrors,
  type FieldValues,
  type Path,
  type UseFormRegister,
} from "react-hook-form";
import { z } from "zod";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { FieldError } from "@/components/auth/field-error";
import { MultiSelect } from "@/components/ui/multi-select";
import type { RoleOption } from "@/src/queries/settings";
import { MAX_BACKDATED_DAYS } from "@/src/shared-kernel/backdated-policy";

export const limitSchema = z.object({
  days: z
    .number({ error: "Enter 0 or more days" })
    .int("Use whole days")
    .min(0, "Enter 0 or more days")
    .max(MAX_BACKDATED_DAYS, `Use at most ${String(MAX_BACKDATED_DAYS)} days`),
  overrideRoleIds: z.array(z.string()),
});

export type LimitValues = z.infer<typeof limitSchema>;

type WithLimits = FieldValues & { create: LimitValues; edit: LimitValues };

const ACTIONS = [
  {
    key: "create",
    daysLabel: "Restrict creating entries older than",
    overrideLabel: "Roles that may create older entries",
  },
  {
    key: "edit",
    daysLabel: "Restrict editing entries older than",
    overrideLabel: "Roles that may edit older entries",
  },
] as const;

/** Create and edit day limits, each with its override Roles (ADR CM-0033). */
export function BackdatedLimitFields<Values extends WithLimits>({
  idPrefix,
  control,
  register,
  errors,
  roles,
}: {
  idPrefix: string;
  control: Control<Values>;
  register: UseFormRegister<Values>;
  errors: FieldErrors<Values>;
  roles: readonly RoleOption[];
}) {
  const limitErrors = errors as FieldErrors<WithLimits>;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {ACTIONS.map((action) => {
        const daysId = `${idPrefix}-${action.key}-days`;
        const overrideId = `${idPrefix}-${action.key}-override`;
        return (
          <div key={action.key} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={daysId} required>
                {action.daysLabel}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id={daysId}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_BACKDATED_DAYS}
                  className="h-10 w-28"
                  aria-required
                  {...register(`${action.key}.days` as Path<Values>, {
                    valueAsNumber: true,
                  })}
                />
                <span className="text-muted-foreground text-sm">days</span>
              </div>
              <FieldError message={limitErrors[action.key]?.days?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={overrideId}>{action.overrideLabel}</Label>
              <Controller
                name={`${action.key}.overrideRoleIds` as Path<Values>}
                control={control}
                render={({ field }) => (
                  <MultiSelect
                    id={overrideId}
                    options={roles}
                    value={field.value as string[]}
                    onChange={field.onChange}
                    placeholder="No override"
                    empty="No Roles found."
                    listLabel="Roles"
                  />
                )}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
