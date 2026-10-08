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
import type { DesignationOption } from "@/src/queries/settings";
import { MAX_BACKDATED_DAYS } from "@/src/shared-kernel/backdated-policy";

import { DesignationMultiSelect } from "./designation-multi-select";

export const limitSchema = z.object({
  days: z
    .number({ error: "Enter 0 or more days" })
    .int("Use whole days")
    .min(0, "Enter 0 or more days")
    .max(MAX_BACKDATED_DAYS, `Use at most ${String(MAX_BACKDATED_DAYS)} days`),
  overrideDesignationIds: z.array(z.string()),
});

export type LimitValues = z.infer<typeof limitSchema>;

type WithLimits = FieldValues & { create: LimitValues; edit: LimitValues };

const ACTIONS = [
  {
    key: "create",
    daysLabel: "Restrict creating entries older than",
    overrideLabel: "Designations that may create older entries",
  },
  {
    key: "edit",
    daysLabel: "Restrict editing entries older than",
    overrideLabel: "Designations that may edit older entries",
  },
] as const;

/** Create and edit day limits, each with its override Designations. */
export function BackdatedLimitFields<Values extends WithLimits>({
  idPrefix,
  control,
  register,
  errors,
  designations,
}: {
  idPrefix: string;
  control: Control<Values>;
  register: UseFormRegister<Values>;
  errors: FieldErrors<Values>;
  designations: readonly DesignationOption[];
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
              <Label htmlFor={daysId}>{action.daysLabel}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id={daysId}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_BACKDATED_DAYS}
                  className="h-10 w-28"
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
                name={`${action.key}.overrideDesignationIds` as Path<Values>}
                control={control}
                render={({ field }) => (
                  <DesignationMultiSelect
                    id={overrideId}
                    designations={designations}
                    value={field.value as string[]}
                    onChange={field.onChange}
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
