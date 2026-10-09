"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";

import { PageHeader } from "@/components/app-shell/page-header";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  useCreateProject,
  useDeleteProject,
  useUpdateProject,
  type ProjectInput,
  type ProjectResponse,
  type ProjectStatus,
} from "@/src/queries/projects";
import { isCalendarDate } from "@/src/shared-kernel/calendar-date";

import { PROJECTS_PATH, projectPath } from "./projects-home";
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_ORDER } from "./project-status";

const dateField = z
  .string()
  .refine((value) => value === "" || isCalendarDate(value), {
    message: "Enter a date",
  });

const schema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter the Project name")
      .max(120, "Use at most 120 characters"),
    status: z.enum(PROJECT_STATUS_ORDER),
    address: z.string().trim().max(500, "Use at most 500 characters"),
    startDate: dateField,
    endDate: dateField,
  })
  .refine(
    (values) =>
      values.startDate === "" ||
      values.endDate === "" ||
      values.endDate >= values.startDate,
    {
      path: ["endDate"],
      message: "The end date cannot be before the start date",
    },
  );

type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  PROJECT_NAME_REQUIRED: "name",
  PROJECT_NAME_TOO_LONG: "name",
  PROJECT_NAME_IN_USE: "name",
  PROJECT_STATUS_INVALID: "status",
  PROJECT_ADDRESS_TOO_LONG: "address",
  PROJECT_DATE_INVALID: "startDate",
  PROJECT_DATES_INVALID: "endDate",
};

const STATUS_ITEMS = PROJECT_STATUS_ORDER.map((status) => ({
  value: status,
  label: PROJECT_STATUS_LABELS[status],
}));

function valuesOf(project: ProjectResponse | null): Values {
  return {
    name: project?.name ?? "",
    status: project?.status ?? "ongoing",
    address: project?.address ?? "",
    startDate: project?.startDate ?? "",
    endDate: project?.endDate ?? "",
  };
}

function inputOf(values: Values): ProjectInput & { status: ProjectStatus } {
  return {
    name: values.name,
    status: values.status,
    address: values.address === "" ? null : values.address,
    startDate: values.startDate === "" ? null : values.startDate,
    endDate: values.endDate === "" ? null : values.endDate,
  };
}

/** Name, status, dates and address (CM-204); M4 adds type, budget and logo. */
function ProjectForm({
  project,
  saving,
  submitLabel,
  cancelHref,
  onSave,
}: {
  project: ProjectResponse | null;
  saving: boolean;
  submitLabel: string;
  cancelHref: string;
  onSave: (input: ProjectInput & { status: ProjectStatus }) => Promise<void>;
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf(project),
  });
  const errors = form.formState.errors;

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSave(inputOf(values));
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  });

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="project-name">Project name</Label>
          <Input
            id="project-name"
            className="h-10"
            autoComplete="off"
            placeholder="Anugraha Residency"
            aria-invalid={errors.name != null}
            {...form.register("name")}
          />
          <FieldError message={errors.name?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="project-status">Status</Label>
          <Controller
            name="status"
            control={form.control}
            render={({ field }) => (
              <Select
                items={STATUS_ITEMS}
                value={field.value}
                onValueChange={(value) => {
                  if (value != null) field.onChange(value);
                }}
              >
                <SelectTrigger
                  id="project-status"
                  size="lg"
                  className="w-full min-w-0"
                  aria-invalid={errors.status != null}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  align="start"
                  alignItemWithTrigger={false}
                  aria-label="Statuses"
                >
                  {STATUS_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError message={errors.status?.message} />
        </div>
        <div className="hidden sm:block" />
        <div className="space-y-1.5">
          <Label htmlFor="project-start">Start date</Label>
          <Input
            id="project-start"
            type="date"
            className="h-10"
            aria-invalid={errors.startDate != null}
            {...form.register("startDate")}
          />
          <FieldError message={errors.startDate?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="project-end">Expected completion</Label>
          <Input
            id="project-end"
            type="date"
            className="h-10"
            aria-invalid={errors.endDate != null}
            {...form.register("endDate")}
          />
          <FieldError message={errors.endDate?.message} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="project-address">Project address</Label>
          <Textarea
            id="project-address"
            rows={3}
            placeholder="Plot 12, Survey No. 45, Saravanampatti, Coimbatore 641035"
            aria-invalid={errors.address != null}
            {...form.register("address")}
          />
          <FieldError message={errors.address?.message} />
        </div>
      </div>
      <FormAlert message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </Button>
        <Link
          href={cancelHref}
          className={buttonVariants({ variant: "outline" })}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

/** New Project (`/app/projects/new`); opens the Project once it is saved. */
export function NewProjectScreen() {
  const router = useRouter();
  const create = useCreateProject();
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Projects", href: PROJECTS_PATH }}
          title="New Project"
          meta="Name it now; dates and address can follow."
        />
        <ProjectForm
          project={null}
          saving={create.isPending}
          submitLabel="Add Project"
          cancelHref={PROJECTS_PATH}
          onSave={async (input) => {
            const created = await create.mutateAsync(input);
            router.push(projectPath(created.id));
          }}
        />
      </div>
    </div>
  );
}

/** Edit Project inside the project shell, with Delete below the form. */
export function EditProjectForm({ project }: { project: ProjectResponse }) {
  const router = useRouter();
  const update = useUpdateProject(project.id);
  const remove = useDeleteProject();
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>();

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-8">
        <section aria-labelledby="edit-project" className="space-y-4">
          <h2 id="edit-project" className="text-lg font-semibold">
            Edit Project
          </h2>
          <ProjectForm
            project={project}
            saving={update.isPending}
            submitLabel="Save"
            cancelHref={projectPath(project.id)}
            onSave={async (input) => {
              await update.mutateAsync({
                ...input,
                expectedUpdatedAt: project.updatedAt,
              });
              router.push(projectPath(project.id));
            }}
          />
        </section>
        <section
          aria-labelledby="delete-project"
          className="space-y-3 rounded-xl border p-4"
        >
          <h2 id="delete-project" className="font-semibold">
            Delete Project
          </h2>
          <p className="text-muted-foreground text-sm">
            Only a Project with no labours, vendors, attendance or payments can
            be deleted. Mark a finished Project Completed instead.
          </p>
          <FormAlert message={deleteError} />
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              setDeleteError(undefined);
              setConfirming(true);
            }}
          >
            Delete Project
          </Button>
        </section>
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {project.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from Projects and from every picker.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                setConfirming(false);
                remove.mutate(project.id, {
                  onSuccess: () => {
                    router.push(PROJECTS_PATH);
                  },
                  onError: (error) => {
                    setDeleteError(fieldForCode(error, {}).message);
                  },
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
