"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
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

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { ProjectStatusBadge } from "@/components/projects/project-status";
import { fieldForCode } from "@/lib/server-errors";
import {
  useDevelopmentCommand,
  type DevelopmentItem,
} from "@/src/queries/developments";
import { projectOptionsQuery } from "@/src/queries/projects";

import { CheckList, type CheckListOption } from "./check-list";
import type { DevelopmentScreenConfig } from "./development-screens";

const NAME_MAX = 100;

/** The Company's Projects (those the viewer sees) as checklist rows. */
function useProjectOptions(): CheckListOption[] {
  const { data } = useSuspenseQuery(projectOptionsQuery);
  return data.items.map((project) => ({
    id: project.id,
    label: project.name,
    trailing: <ProjectStatusBadge status={project.status} />,
  }));
}

function ProjectsField({
  config,
  value,
  onChange,
}: {
  config: DevelopmentScreenConfig;
  value: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  const options = useProjectOptions();
  if (options.length === 0)
    return (
      <p className="text-muted-foreground text-sm">
        Add a Project first; then assign this {config.singular} to it here or
        from the Project.
      </p>
    );
  return (
    <div className="max-h-[50vh] overflow-y-auto">
      <CheckList
        legend="Projects"
        idPrefix={`${config.list}-projects`}
        options={options}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

/**
 * Add a row with the Projects it is on, or rename a Company-made one (with
 * the `updatedAt` it loaded).
 */
export function DevelopmentNameDialog({
  config,
  item,
  onClose,
}: {
  config: DevelopmentScreenConfig;
  /** Null to add. */
  item: DevelopmentItem | null;
  onClose: () => void;
}) {
  const schema = z.object({
    name: z
      .string()
      .trim()
      .min(1, `Enter the ${config.singular} name`)
      .max(NAME_MAX, `Use at most ${String(NAME_MAX)} characters`),
    projectIds: z.array(z.string()),
  });
  type Values = z.infer<typeof schema>;
  const serverFields: Record<string, keyof Values> = {
    [`${config.code}_NAME_REQUIRED`]: "name",
    [`${config.code}_NAME_TOO_LONG`]: "name",
    [`${config.code}_NAME_IN_USE`]: "name",
    PROJECT_NOT_FOUND: "projectIds",
  };

  const command = useDevelopmentCommand(config.list);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: item?.name ?? "", projectIds: [] },
  });
  const errors = form.formState.errors;

  const submit = form.handleSubmit(async (values) => {
    try {
      await command.mutateAsync(
        item == null
          ? {
              kind: "create",
              input: { name: values.name, projectIds: values.projectIds },
            }
          : {
              kind: "rename",
              id: item.id,
              name: values.name,
              expectedUpdatedAt: item.updatedAt,
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
              {item == null ? `Add ${config.singular}` : `Rename ${item.name}`}
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
              {...form.register("name")}
            />
            <FieldError message={errors.name?.message} />
          </div>
          {item == null ? (
            <div className="space-y-1.5">
              <Controller
                control={form.control}
                name="projectIds"
                render={({ field }) => (
                  <ProjectsField
                    config={config}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <FieldError message={errors.projectIds?.message} />
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

/** Assign Projects: the row's Projects as a checklist, saved as a whole. */
export function AssignProjectsDialog({
  config,
  item,
  onClose,
}: {
  config: DevelopmentScreenConfig;
  item: DevelopmentItem;
  onClose: () => void;
}) {
  const command = useDevelopmentCommand(config.list);
  const [projectIds, setProjectIds] = useState<string[]>(item.projectIds);
  const [error, setError] = useState<string | undefined>();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Projects with {item.name}</DialogTitle>
          <DialogDescription>
            {item.disabled
              ? `${item.name} is disabled: it can leave Projects but not join new ones. Enable it to assign it.`
              : `Tick the Projects that have this ${config.singular}. Their site entries can then be located at it.`}
          </DialogDescription>
        </DialogHeader>
        <ProjectsField
          config={config}
          value={projectIds}
          onChange={setProjectIds}
        />
        <FormAlert message={error} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={command.isPending}
            onClick={() => {
              setError(undefined);
              command.mutate(
                { kind: "assign", id: item.id, projectIds },
                {
                  onSuccess: onClose,
                  onError: (failure) => {
                    setError(fieldForCode(failure, {}).message);
                  },
                },
              );
            }}
          >
            {command.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
