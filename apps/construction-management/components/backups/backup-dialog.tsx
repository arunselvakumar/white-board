"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
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

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  backupQueries,
  useRequestBackup,
  type Backup,
} from "@/src/queries/backups";

import { BackupModulePicker } from "./backup-module-picker";
import { BackupProgress } from "./backup-progress";
import { BackupModulesSkeleton } from "./backups-skeletons";

const schema = z
  .object({
    modules: z.array(z.string()).min(1, "Choose at least one module"),
    from: z.string(),
    to: z.string(),
    includeData: z.boolean(),
    includeMedia: z.boolean(),
  })
  .refine((values) => values.includeData || values.includeMedia, {
    message: "Choose Data, Media or both",
    path: ["includeData"],
  })
  .refine(
    (values) =>
      values.from === "" || values.to === "" || values.from <= values.to,
    { message: "To must be on or after From", path: ["to"] },
  );

type Values = z.input<typeof schema>;
type Parsed = z.output<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  BACKUP_MODULES_REQUIRED: "modules",
  BACKUP_RANGE_INVALID: "to",
  BACKUP_CONTENT_REQUIRED: "includeData",
};

function CheckField({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex min-w-0 cursor-pointer gap-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="mt-0.5"
      />
      <span className="min-w-0 space-y-0.5">
        <span className="block text-sm font-medium">{label}</span>
        <span className="text-muted-foreground block text-sm">{hint}</span>
      </span>
    </label>
  );
}

/**
 * Backup (CM-906, ADR CM-0021 §8): pick modules (grouped, with Select
 * all), and for a Project a date range and Data and/or Media, then
 * Generate. The dialog then follows the backup until its ZIP is ready.
 */
export function BackupDialog({
  scope,
  projectId,
  title,
  description,
  onClose,
}: {
  scope: "project" | "masters";
  projectId?: string;
  title: string;
  description: string;
  onClose: () => void;
}) {
  const options = useQuery(backupQueries.options(scope, projectId));
  const request = useRequestBackup();
  const [requested, setRequested] = useState<Backup | null>(null);
  const form = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(schema),
    defaultValues: {
      modules: [],
      from: "",
      to: "",
      includeData: true,
      includeMedia: false,
    },
  });
  const errors = form.formState.errors;
  const modules = options.data?.modules ?? [];
  const mediaOffered = scope === "project" && modules.some((m) => m.hasMedia);

  const submit = async (values: Parsed) => {
    try {
      const backup = await request.mutateAsync(
        scope === "project"
          ? {
              scope: "project",
              projectId: projectId ?? "",
              modules: values.modules,
              ...(values.from === "" ? {} : { from: values.from }),
              ...(values.to === "" ? {} : { to: values.to }),
              includeData: values.includeData,
              includeMedia: values.includeMedia,
            }
          : { scope: "masters", modules: values.modules },
      );
      setRequested(backup);
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="grid-cols-1 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {requested != null ? (
          <>
            <BackupProgress backupId={requested.id} initial={requested} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : options.isPending ? (
          <BackupModulesSkeleton />
        ) : options.isError ? (
          <FormAlert message={fieldForCode(options.error, {}).message} />
        ) : modules.length === 0 ? (
          <>
            <p className="text-muted-foreground text-sm">
              You cannot back up anything here: it needs View on the modules.
              Ask the Owner to change your Permission Matrix.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            noValidate
            aria-label={title}
            className="min-w-0 space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit(submit)(event);
            }}
          >
            <Controller
              name="modules"
              control={form.control}
              render={({ field }) => (
                <BackupModulePicker
                  modules={modules}
                  value={field.value}
                  onChange={field.onChange}
                  invalid={errors.modules != null}
                />
              )}
            />
            <FieldError message={errors.modules?.message} />
            {scope === "project" ? (
              <>
                <fieldset className="min-w-0 space-y-2">
                  <legend className="text-sm font-medium">Date range</legend>
                  <p className="text-muted-foreground text-sm">
                    Leave both empty for all dates. Records are chosen by their
                    own date (worksheet date, PO date, …).
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <Label htmlFor="backup-from">From</Label>
                      <Input
                        id="backup-from"
                        type="date"
                        className="h-10"
                        {...form.register("from")}
                      />
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <Label htmlFor="backup-to">To</Label>
                      <Input
                        id="backup-to"
                        type="date"
                        className="h-10"
                        aria-invalid={errors.to != null}
                        {...form.register("to")}
                      />
                    </div>
                  </div>
                  <FieldError message={errors.to?.message} />
                </fieldset>
                <fieldset className="min-w-0 space-y-3">
                  <legend className="text-sm font-medium">Include</legend>
                  <Controller
                    name="includeData"
                    control={form.control}
                    render={({ field }) => (
                      <CheckField
                        id="backup-include-data"
                        label="Data"
                        hint="One CSV (opens in Excel) and one JSON file per list."
                        checked={field.value}
                        onChange={field.onChange}
                      />
                    )}
                  />
                  {mediaOffered ? (
                    <Controller
                      name="includeMedia"
                      control={form.control}
                      render={({ field }) => (
                        <CheckField
                          id="backup-include-media"
                          label="Media"
                          hint="Photos, drawings and receipts, in a folder per record."
                          checked={field.value}
                          onChange={field.onChange}
                        />
                      )}
                    />
                  ) : null}
                  <FieldError message={errors.includeData?.message} />
                </fieldset>
              </>
            ) : null}
            <FormAlert message={errors.root?.message} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={request.isPending}>
                {request.isPending ? "Generating…" : "Generate"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Project → options → Backup (CM-906). */
export function ProjectBackupDialog({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  return (
    <BackupDialog
      scope="project"
      projectId={projectId}
      title={`Back up ${projectName}`}
      description="A ZIP of the modules you choose. The link works for 7 days, for you only."
      onClose={onClose}
    />
  );
}

/** Masters → Backup (CM-906). */
export function MastersBackupDialog({ onClose }: { onClose: () => void }) {
  return (
    <BackupDialog
      scope="masters"
      title="Back up master records"
      description="A ZIP of the master lists you choose. The link works for 7 days, for you only."
      onClose={onClose}
    />
  );
}
