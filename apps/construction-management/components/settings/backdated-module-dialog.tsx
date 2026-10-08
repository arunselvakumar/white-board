"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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
import { Label } from "@repo/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/radio-group";

import type { DesignationOption } from "@/src/queries/settings";

import {
  BackdatedLimitFields,
  limitSchema,
  type LimitValues,
} from "./backdated-limit-fields";

export const moduleSettingSchema = z.object({
  mode: z.enum(["global", "custom"]),
  create: limitSchema,
  edit: limitSchema,
});

export type ModuleSettingValues = z.infer<typeof moduleSettingSchema>;

/** "Global, Create 0d · Edit 0d" — what a module row shows. */
export function moduleSummary(
  setting: ModuleSettingValues,
  defaults: { create: LimitValues; edit: LimitValues },
): string {
  const limits = setting.mode === "custom" ? setting : defaults;
  return `${setting.mode === "custom" ? "Custom" : "Global"}, Create ${String(limits.create.days)}d · Edit ${String(limits.edit.days)}d`;
}

/** Override one module's limits; Apply returns the setting to the page form. */
export function BackdatedModuleDialog({
  label,
  setting,
  defaults,
  designations,
  onApply,
  onClose,
}: {
  label: string;
  setting: ModuleSettingValues;
  defaults: { create: LimitValues; edit: LimitValues };
  designations: readonly DesignationOption[];
  onApply: (setting: ModuleSettingValues) => void;
  onClose: () => void;
}) {
  const form = useForm<ModuleSettingValues>({
    resolver: zodResolver(moduleSettingSchema),
    defaultValues:
      setting.mode === "custom"
        ? setting
        : { mode: "global", create: defaults.create, edit: defaults.edit },
  });
  const mode = useWatch({ control: form.control, name: "mode" });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <form
          noValidate
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit((values) => {
              onApply(values);
            })(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              Use the default limits, or set this module&apos;s own.
            </DialogDescription>
          </DialogHeader>

          <Controller
            name="mode"
            control={form.control}
            render={({ field }) => (
              <RadioGroup
                aria-label="Limits for this module"
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value);
                }}
                className="gap-3"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="module-mode-global" value="global" />
                  <Label htmlFor="module-mode-global" className="font-normal">
                    Use the default limits (Create {defaults.create.days}d ·
                    Edit {defaults.edit.days}d)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="module-mode-custom" value="custom" />
                  <Label htmlFor="module-mode-custom" className="font-normal">
                    Custom limits for this module
                  </Label>
                </div>
              </RadioGroup>
            )}
          />

          {mode === "custom" && (
            <BackdatedLimitFields
              idPrefix="module"
              control={form.control}
              register={form.register}
              errors={form.formState.errors}
              designations={designations}
            />
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Apply</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
