"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Suspense } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
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
import { Switch } from "@repo/ui/components/switch";

import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  useSaveWorksheetSettings,
  worksheetSettingsQuery,
  type WorksheetSettings,
} from "@/src/queries/worksheets";
import {
  WORKSHEET_SECTION_LABELS,
  WORKSHEET_SECTIONS,
} from "@/src/site-work/domain/worksheet";
import { SettingsListSkeleton } from "@/components/site-work/site-work-skeletons";

const TOGGLES = [
  { key: "showLocation", label: "Location Type" },
  { key: "showWorkType", label: "Work Type" },
  { key: "showApproxWorkDone", label: "Approx Work Done" },
  { key: "showLabour", label: "Labour Details" },
  { key: "showMaterials", label: "Material consumption" },
  { key: "showRemark", label: "Remark" },
  { key: "showPhotos", label: "Work Photos" },
] as const;

const schema = z.object({
  showLocation: z.boolean(),
  showWorkType: z.boolean(),
  showApproxWorkDone: z.boolean(),
  showLabour: z.boolean(),
  showMaterials: z.boolean(),
  showRemark: z.boolean(),
  showPhotos: z.boolean(),
  sections: z.array(z.object({ key: z.enum(WORKSHEET_SECTIONS) })).length(4),
  approvalEnabled: z.boolean(),
});
type Values = z.infer<typeof schema>;

/**
 * "Setting for the work item form" (CM-0016 §2): which sections and
 * fields the Project's worksheet form shows, the order of its four
 * sections, and whether sheets need approval. Saved sheets do not change.
 */
export function WorksheetSettingsDialog({
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
          <DialogTitle>Daily Worksheet settings</DialogTitle>
          <DialogDescription>
            What this Project&apos;s worksheet form shows, in which order, and
            whether sheets need approval. Saved sheets keep what they have.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <Suspense fallback={<SettingsListSkeleton />}>
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

function valuesOf(settings: WorksheetSettings): Values {
  return {
    showLocation: settings.showLocation,
    showWorkType: settings.showWorkType,
    showApproxWorkDone: settings.showApproxWorkDone,
    showLabour: settings.showLabour,
    showMaterials: settings.showMaterials,
    showRemark: settings.showRemark,
    showPhotos: settings.showPhotos,
    sections: settings.sectionOrder.map((key) => ({ key })),
    approvalEnabled: settings.approvalEnabled,
  };
}

function SettingsForm({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone: () => void;
}) {
  const { data: settings } = useSuspenseQuery(
    worksheetSettingsQuery(projectId),
  );
  const save = useSaveWorksheetSettings();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf(settings),
  });
  const sections = useFieldArray({ control: form.control, name: "sections" });

  const submit = async (values: Values) => {
    try {
      const { sections: order, ...rest } = values;
      await save.mutateAsync({
        projectId,
        ...rest,
        sectionOrder: order.map((section) => section.key),
        expectedUpdatedAt: settings.updatedAt,
      });
      onDone();
    } catch (failure) {
      form.setError("root", { message: fieldForCode(failure, {}).message });
    }
  };

  const toggle = (
    name: (typeof TOGGLES)[number]["key"] | "approvalEnabled",
    label: string,
  ) => {
    const id = `worksheet-setting-${name}`;
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
      aria-label="Daily Worksheet settings"
      className="flex min-h-0 flex-1 flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit(submit)(event);
      }}
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        <section
          aria-labelledby="worksheet-settings-shown"
          className="space-y-2"
        >
          <h3 id="worksheet-settings-shown" className="text-sm font-semibold">
            Shown on the form
          </h3>
          <ul className="bg-card divide-y rounded-lg border">
            {TOGGLES.map((item) => toggle(item.key, item.label))}
          </ul>
        </section>

        <section
          aria-labelledby="worksheet-settings-order"
          className="space-y-2"
        >
          <h3 id="worksheet-settings-order" className="text-sm font-semibold">
            Section order
          </h3>
          <ol
            aria-label="Section order"
            className="bg-card divide-y rounded-lg border"
          >
            {sections.fields.map((field, index) => {
              const label = WORKSHEET_SECTION_LABELS[field.key];
              return (
                <li
                  key={field.id}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <span className="text-sm">
                    <span className="text-muted-foreground tabular-nums">
                      {index + 1}.
                    </span>{" "}
                    {label}
                  </span>
                  <span className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${label} up`}
                      disabled={index === 0}
                      onClick={() => {
                        sections.move(index, index - 1);
                      }}
                    >
                      <ArrowUp aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${label} down`}
                      disabled={index === sections.fields.length - 1}
                      onClick={() => {
                        sections.move(index, index + 1);
                      }}
                    >
                      <ArrowDown aria-hidden="true" />
                    </Button>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        <section
          aria-labelledby="worksheet-settings-approval"
          className="space-y-2"
        >
          <h3
            id="worksheet-settings-approval"
            className="text-sm font-semibold"
          >
            Approval
          </h3>
          <ul className="bg-card rounded-lg border">
            {toggle("approvalEnabled", "Worksheets need approval")}
          </ul>
          <p className="text-muted-foreground text-xs">
            With approval on, a saved sheet waits for a member with Approve.
            Turning it on or off does not change sheets already saved.
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
