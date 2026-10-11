"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
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
import { Label } from "@repo/ui/components/label";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Switch } from "@repo/ui/components/switch";

import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  equipmentSheetSettingsQuery,
  useSaveEquipmentSheetSettings,
  type EquipmentSheetSettings,
} from "@/src/queries/equipment-sheets";
import {
  EQUIPMENT_SHEET_FIELD_TOGGLES,
  EQUIPMENT_SHEET_TOGGLE_LABELS,
  type EquipmentSheetFieldToggle,
} from "@/src/site-work/domain/equipment-usage";

const schema = z.object({
  showOperator: z.boolean(),
  showSupervisor: z.boolean(),
  showLocation: z.boolean(),
  showApproxWorkDone: z.boolean(),
  showBillableQty: z.boolean(),
  showFuel: z.boolean(),
  showRemarks: z.boolean(),
  showFiles: z.boolean(),
  showMaterials: z.boolean(),
  showMeterReadings: z.boolean(),
  showBreakdownHours: z.boolean(),
  approvalEnabled: z.boolean(),
});
type Values = z.infer<typeof schema>;

/**
 * The usage-sheet form settings (CM-0016 §2): which fields the Project's
 * Equipment Usage form shows, and whether sheets need approval. Saved
 * sheets do not change.
 */
export function EquipmentSheetSettingsDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Equipment Usage settings</DialogTitle>
          <DialogDescription>
            What this Project&apos;s usage-sheet form shows, and whether sheets
            need approval. Saved sheets keep what they have.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <Suspense
            fallback={
              <div className="space-y-2" aria-busy="true">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            }
          >
            <SettingsForm
              projectId={projectId}
              onDone={() => {
                onOpenChange(false);
              }}
            />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}

function valuesOf(settings: EquipmentSheetSettings): Values {
  const { projectId: _projectId, updatedAt: _updatedAt, ...values } = settings;
  return values;
}

function SettingsForm({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone: () => void;
}) {
  const { data: settings } = useSuspenseQuery(
    equipmentSheetSettingsQuery(projectId),
  );
  const save = useSaveEquipmentSheetSettings();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf(settings),
  });

  const submit = async (values: Values) => {
    try {
      await save.mutateAsync({
        projectId,
        ...values,
        expectedUpdatedAt: settings.updatedAt,
      });
      onDone();
    } catch (failure) {
      form.setError("root", { message: fieldForCode(failure, {}).message });
    }
  };

  const toggle = (
    name: EquipmentSheetFieldToggle | "approvalEnabled",
    label: string,
  ) => {
    const id = `equipment-sheet-setting-${name}`;
    return (
      <li
        key={name}
        className="flex items-center justify-between gap-4 px-3 py-2.5"
      >
        <Label htmlFor={id} className="min-w-0 font-normal">
          {label}
        </Label>
        <Controller
          name={name}
          control={form.control}
          render={({ field }) => (
            <Switch
              id={id}
              checked={field.value}
              onCheckedChange={(checked) => {
                field.onChange(checked);
              }}
            />
          )}
        />
      </li>
    );
  };

  return (
    <form
      noValidate
      aria-label="Equipment Usage settings"
      className="flex min-h-0 flex-1 flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit(submit)(event);
      }}
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        <section
          aria-labelledby="equipment-sheet-settings-shown"
          className="space-y-2"
        >
          <h3
            id="equipment-sheet-settings-shown"
            className="text-sm font-semibold"
          >
            Shown on the form
          </h3>
          <ul className="divide-y rounded-lg border">
            {EQUIPMENT_SHEET_FIELD_TOGGLES.map((key) =>
              toggle(key, EQUIPMENT_SHEET_TOGGLE_LABELS[key]),
            )}
          </ul>
          <p className="text-muted-foreground text-xs">
            With meter readings hidden, hourly meter machines take the hours
            worked instead.
          </p>
        </section>
        <section
          aria-labelledby="equipment-sheet-settings-approval"
          className="space-y-2"
        >
          <h3
            id="equipment-sheet-settings-approval"
            className="text-sm font-semibold"
          >
            Approval
          </h3>
          <ul className="rounded-lg border">
            {toggle("approvalEnabled", "Usage sheets need approval")}
          </ul>
          <p className="text-muted-foreground text-xs">
            With approval on, a saved sheet waits for a member with Approve, and
            a rented machine&apos;s hire counts once it is approved. Turning it
            on or off does not change sheets already saved.
          </p>
        </section>
      </div>
      <FormAlert message={form.formState.errors.root?.message} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save settings"}
        </Button>
      </DialogFooter>
    </form>
  );
}
