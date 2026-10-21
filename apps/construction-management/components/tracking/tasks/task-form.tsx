"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type FieldPath,
} from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
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

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { LocationPicker } from "@/components/locations/location-picker";
import {
  isRupees,
  MoneyInput,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import { QueryHttpError } from "@/src/queries/http";
import { useEnsureTag } from "@/src/queries/tracking-masters";
import {
  canInTracking,
  trackingAccessQuery,
} from "@/src/queries/tracking-access";
import {
  taskFormOptionsQuery,
  tasksPath,
  useCreateTask,
  useUpdateTask,
  type CreateTaskInput,
  type TaskDetail,
} from "@/src/queries/tracking-tasks";
import type { LocationRef } from "@/src/shared-kernel/location-ref";
import { TASK_LIMITS } from "@/src/tracking/domain/task";
import { TRACKING_PRIORITIES } from "@/src/tracking/domain/tracking-documents";

import { ChipsSelect } from "./chips-select";
import { LocationPickerSkeleton } from "@/components/locations/locations-skeletons";

const NONE = "none";
const QUANTITY = /^\d{1,11}(\.\d{1,3})?$/;
const max = (n: number) =>
  z.string().max(n, `Use at most ${String(n)} characters.`);

const schema = z
  .object({
    name: max(TASK_LIMITS.name).refine(
      (value) => value.trim() !== "",
      "Enter the task's name.",
    ),
    description: max(TASK_LIMITS.description),
    assigneeIds: z.array(z.string()),
    startDate: z.string(),
    dueDate: z.string(),
    priority: z.string(),
    siteLocation: z.custom<LocationRef | null>(),
    extraLocations: z.array(z.object({ ref: z.custom<LocationRef | null>() })),
    departmentId: z.string(),
    contractorId: z.string(),
    tagIds: z.array(z.string()),
    totalWorkQty: z.string().trim(),
    totalWorkUnitId: z.string(),
    totalPrice: z.string().trim(),
  })
  .superRefine((values, context) => {
    if (
      values.startDate !== "" &&
      values.dueDate !== "" &&
      values.dueDate < values.startDate
    )
      context.addIssue({
        code: "custom",
        path: ["dueDate"],
        message: "The Due Date cannot be before the Start Date.",
      });
    if (values.totalWorkQty !== "") {
      if (
        !QUANTITY.test(values.totalWorkQty) ||
        Number(values.totalWorkQty) <= 0
      )
        context.addIssue({
          code: "custom",
          path: ["totalWorkQty"],
          message: "Enter a quantity above 0, at most three decimals.",
        });
      if (values.totalWorkUnitId === "")
        context.addIssue({
          code: "custom",
          path: ["totalWorkUnitId"],
          message: "Choose the unit.",
        });
    } else if (values.totalWorkUnitId !== "")
      context.addIssue({
        code: "custom",
        path: ["totalWorkQty"],
        message: "Enter the total work in this unit, or clear the unit.",
      });
    if (values.totalPrice !== "" && !isRupees(values.totalPrice))
      context.addIssue({
        code: "custom",
        path: ["totalPrice"],
        message: "Enter the price in rupees, like 150000.50.",
      });
    values.extraLocations.forEach((item, index) => {
      if (item.ref == null)
        context.addIssue({
          code: "custom",
          path: ["extraLocations", index, "ref"],
          message: "Choose the location, or remove it.",
        });
    });
  });

type Values = z.infer<typeof schema>;

/** Server fields to the form's. */
const SERVER_FIELDS: Record<string, FieldPath<Values>> = {
  name: "name",
  description: "description",
  assigneeIds: "assigneeIds",
  startDate: "startDate",
  dueDate: "dueDate",
  priority: "priority",
  siteLocation: "siteLocation",
  departmentId: "departmentId",
  contractorId: "contractorId",
  tagIds: "tagIds",
  totalWorkQty: "totalWorkQty",
  totalWorkUnitId: "totalWorkUnitId",
  totalPrice: "totalPrice",
};

function defaults(task: TaskDetail | undefined): Values {
  if (task == null)
    return {
      name: "",
      description: "",
      assigneeIds: [],
      startDate: "",
      dueDate: "",
      priority: "",
      siteLocation: null,
      extraLocations: [],
      departmentId: "",
      contractorId: "",
      tagIds: [],
      totalWorkQty: "",
      totalWorkUnitId: "",
      totalPrice: "",
    };
  return {
    name: task.name,
    description: task.description ?? "",
    assigneeIds: task.assignees.map((a) => a.id),
    startDate: task.startDate ?? "",
    dueDate: task.dueDate ?? "",
    priority: task.priority ?? "",
    siteLocation: task.siteLocation,
    extraLocations: task.extraLocations.map((ref) => ({ ref })),
    departmentId: task.department?.id ?? "",
    contractorId: task.contractor?.id ?? "",
    tagIds: task.tags.map((t) => t.id),
    totalWorkQty: task.totalWorkQty ?? "",
    totalWorkUnitId: task.unit?.id ?? "",
    totalPrice: task.totalPrice == null ? "" : paiseToRupees(task.totalPrice),
  };
}

function OptionSelect({
  id,
  value,
  onChange,
  items,
  placeholder,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  items: readonly { value: string; label: string }[];
  placeholder: string;
  invalid?: boolean;
}) {
  const all = [{ value: NONE, label: placeholder }, ...items];
  return (
    <Select
      items={all}
      value={value === "" ? NONE : value}
      onValueChange={(next) => {
        if (next == null) return;
        onChange(next === NONE ? "" : next);
      }}
    >
      <SelectTrigger id={id} className="w-full min-w-0" aria-invalid={invalid}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {all.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Keeps a stored option that is no longer offered (a disabled master). */
function withCurrent(
  items: { value: string; label: string }[],
  current: { id: string; name: string | null } | null | undefined,
  removed: string,
) {
  if (current != null && !items.some((item) => item.value === current.id))
    items.push({ value: current.id, label: current.name ?? removed });
  return items;
}

/**
 * Add or edit a task (CM-802, ADR CM-0019 §5): name, description,
 * assignees, planned dates, priority, the location and other locations of
 * its type, Department, Contractor, Tags (created inline with Tags
 * Create), Total work with its unit and Total Price (Financial only). A
 * summary task's dates, work and price roll up from its sub-tasks, so the
 * form leaves them out. With `parent` it adds a Sub-Task.
 */
export function TaskForm({
  projectId,
  task,
  parent,
}: {
  projectId: string;
  /** Edit this task. */
  task?: TaskDetail;
  /** Add a Sub-Task under this one. */
  parent?: { id: string; label: string; name: string } | null;
}) {
  const router = useRouter();
  const { data: options } = useSuspenseQuery(taskFormOptionsQuery(projectId));
  const { data: access } = useSuspenseQuery(trackingAccessQuery(projectId));
  const create = useCreateTask();
  const update = useUpdateTask(task?.id ?? "");
  const ensureTag = useEnsureTag();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults(task),
  });
  const extras = useFieldArray({
    control: form.control,
    name: "extraLocations",
  });
  const errors = form.formState.errors;
  const mainLocation = useWatch({
    control: form.control,
    name: "siteLocation",
  });
  const financial = canInTracking(access, "tracking.tasks", "financial");
  const canCreateTags = canInTracking(access, "masters.tags", "create");
  const summary = task?.isSummary === true;

  const departments = withCurrent(
    options.departments.map((d) => ({ value: d.id, label: d.name })),
    task?.department,
    "A removed Department",
  );
  const contractors = withCurrent(
    options.contractors.map((c) => ({ value: c.id, label: c.name })),
    task?.contractor,
    "A removed Contractor",
  );
  const units = withCurrent(
    options.units.map((u) => ({ value: u.id, label: u.name })),
    task?.unit,
    "A removed unit",
  );
  const members = [
    ...options.members.map((m) => ({
      id: m.id,
      name: m.isOwner ? `${m.name} (Owner)` : m.name,
    })),
    ...(task?.assignees ?? [])
      .filter((a) => !options.members.some((m) => m.id === a.id))
      .map((a) => ({ id: a.id, name: a.name ?? "A former member" })),
  ];
  const tags = [
    ...options.tags,
    ...(task?.tags ?? [])
      .filter((t) => !options.tags.some((o) => o.id === t.id))
      .map((t) => ({ id: t.id, name: t.name ?? "A removed tag" })),
  ];

  const submit = async (input: Values) => {
    setError(null);
    const orNull = (value: string) =>
      value.trim() === "" ? null : value.trim();
    const body = {
      name: input.name.trim(),
      description: orNull(input.description),
      assigneeIds: input.assigneeIds,
      startDate: orNull(input.startDate),
      dueDate: orNull(input.dueDate),
      priority: (orNull(input.priority) ?? null) as CreateTaskInput["priority"],
      siteLocation: input.siteLocation as CreateTaskInput["siteLocation"],
      extraLocations: input.extraLocations.flatMap((item) =>
        item.ref == null ? [] : [item.ref],
      ) as CreateTaskInput["extraLocations"],
      departmentId: orNull(input.departmentId),
      contractorId: orNull(input.contractorId),
      tagIds: input.tagIds,
      totalWorkQty: orNull(input.totalWorkQty),
      totalWorkUnitId: orNull(input.totalWorkUnitId),
      totalPrice:
        !financial || input.totalPrice === ""
          ? null
          : rupeesToPaise(input.totalPrice),
    };
    try {
      let id: string;
      if (task == null) {
        const created = await create.mutateAsync({
          ...body,
          projectId,
          parentId: parent?.id ?? null,
        });
        id = created.id;
      } else {
        await update.mutateAsync({
          ...body,
          expectedUpdatedAt: task.updatedAt,
        });
        id = task.id;
      }
      // Stay busy until the task's page opens, so a second press saves nothing.
      setSaved(true);
      router.push(tasksPath(projectId, id));
    } catch (caught) {
      if (caught instanceof QueryHttpError) {
        const raw = (caught.details as { field?: unknown } | undefined)?.field;
        const field = typeof raw === "string" ? SERVER_FIELDS[raw] : undefined;
        if (field != null) {
          form.setError(field, { message: caught.message });
          return;
        }
        setError(caught.message);
        return;
      }
      setError("Something went wrong. Please try again.");
    }
  };

  const busy = form.formState.isSubmitting || saved;
  const title =
    task != null
      ? `Edit ${task.label}`
      : parent != null
        ? `New sub-task of ${parent.label}`
        : "New task";

  return (
    <form
      noValidate
      aria-label={title}
      className="w-full max-w-4xl space-y-6"
      onSubmit={(event) => {
        void form.handleSubmit(submit)(event);
      }}
    >
      {parent != null && (
        <p className="bg-muted/50 rounded-lg border px-3 py-2 text-sm">
          Sub-task of {parent.label} {parent.name}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="task-name">Task name</Label>
          <Input
            id="task-name"
            autoComplete="off"
            aria-invalid={errors.name != null}
            {...form.register("name")}
          />
          <FieldError message={errors.name?.message} />
        </div>
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="task-description">Description</Label>
          <Textarea
            id="task-description"
            rows={3}
            aria-invalid={errors.description != null}
            {...form.register("description")}
          />
          <FieldError message={errors.description?.message} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="task-assignees">Assign to</Label>
          <Controller
            control={form.control}
            name="assigneeIds"
            render={({ field }) => (
              <ChipsSelect
                id="task-assignees"
                label="Team Members"
                options={members}
                value={field.value}
                onChange={field.onChange}
                placeholder="Choose Team Members"
                emptyText="No Team Members found."
                invalid={errors.assigneeIds != null}
              />
            )}
          />
          <FieldError message={errors.assigneeIds?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="task-priority">Priority</Label>
          <Controller
            control={form.control}
            name="priority"
            render={({ field }) => (
              <OptionSelect
                id="task-priority"
                value={field.value}
                onChange={field.onChange}
                placeholder="None"
                items={TRACKING_PRIORITIES.map((item) => ({
                  value: item.key,
                  label: item.label,
                }))}
              />
            )}
          />
        </div>
        {summary ? (
          <p className="text-muted-foreground text-sm sm:col-span-2 lg:col-span-3">
            This task has sub-tasks: its dates, work, price and progress roll up
            from them.
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="task-start">Start Date</Label>
              <Input
                id="task-start"
                type="date"
                aria-invalid={errors.startDate != null}
                {...form.register("startDate")}
              />
              <FieldError message={errors.startDate?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-due">Due Date</Label>
              <Input
                id="task-due"
                type="date"
                aria-invalid={errors.dueDate != null}
                {...form.register("dueDate")}
              />
              <FieldError message={errors.dueDate?.message} />
            </div>
          </>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="task-department">Department</Label>
          <Controller
            control={form.control}
            name="departmentId"
            render={({ field }) => (
              <OptionSelect
                id="task-department"
                value={field.value}
                onChange={field.onChange}
                placeholder="None"
                items={departments}
                invalid={errors.departmentId != null}
              />
            )}
          />
          <FieldError message={errors.departmentId?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="task-contractor">Contractor</Label>
          <Controller
            control={form.control}
            name="contractorId"
            render={({ field }) => (
              <OptionSelect
                id="task-contractor"
                value={field.value}
                onChange={field.onChange}
                placeholder={
                  contractors.length === 0
                    ? "No Contractors on this Project"
                    : "None"
                }
                items={contractors}
                invalid={errors.contractorId != null}
              />
            )}
          />
          <FieldError message={errors.contractorId?.message} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="task-tags">Tags</Label>
          <Controller
            control={form.control}
            name="tagIds"
            render={({ field }) => (
              <ChipsSelect
                id="task-tags"
                label="Tags"
                options={tags}
                value={field.value}
                onChange={field.onChange}
                placeholder={
                  canCreateTags ? "Choose or type a new tag" : "Choose tags"
                }
                emptyText="No tags found."
                invalid={errors.tagIds != null}
                {...(canCreateTags
                  ? {
                      onCreate: async (name: string) => {
                        try {
                          return await ensureTag.mutateAsync(name);
                        } catch (caught) {
                          form.setError("tagIds", {
                            message:
                              caught instanceof QueryHttpError
                                ? caught.message
                                : "The tag could not be created.",
                          });
                          return null;
                        }
                      },
                    }
                  : {})}
              />
            )}
          />
          <FieldError message={errors.tagIds?.message} />
        </div>
      </div>

      <fieldset className="min-w-0 space-y-3">
        <legend className="text-sm font-semibold">Location</legend>
        <Suspense fallback={<LocationPickerSkeleton />}>
          <Controller
            control={form.control}
            name="siteLocation"
            render={({ field }) => (
              <LocationPicker
                projectId={projectId}
                value={field.value}
                onChange={field.onChange}
                invalid={errors.siteLocation != null}
              />
            )}
          />
          <FieldError message={errors.siteLocation?.message} />
          {extras.fields.map((item, index) => (
            <div key={item.id} className="flex min-w-0 items-start gap-2">
              <div className="min-w-0 flex-1">
                <Controller
                  control={form.control}
                  name={`extraLocations.${index}.ref`}
                  render={({ field }) => (
                    <LocationPicker
                      projectId={projectId}
                      label={`Other location ${String(index + 1)}`}
                      value={field.value}
                      onChange={field.onChange}
                      invalid={errors.extraLocations?.[index]?.ref != null}
                    />
                  )}
                />
                <FieldError
                  message={errors.extraLocations?.[index]?.ref?.message}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove other location ${String(index + 1)}`}
                onClick={() => {
                  extras.remove(index);
                }}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          ))}
        </Suspense>
        <FieldError message={errors.extraLocations?.message} />
        {(mainLocation != null || extras.fields.length > 0) && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={extras.fields.length >= TASK_LIMITS.extraLocations}
              onClick={() => {
                extras.append({ ref: null });
              }}
            >
              <Plus aria-hidden="true" />
              Add another location
            </Button>
            <p className="text-muted-foreground text-xs">
              Other locations are of the same Location Type as the main one, and
              in the same Wing.
            </p>
          </>
        )}
      </fieldset>

      {!summary && (
        <fieldset className="min-w-0 space-y-3">
          <legend className="text-sm font-semibold">Work and price</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-work">Total work</Label>
              <Input
                id="task-work"
                inputMode="decimal"
                autoComplete="off"
                aria-invalid={errors.totalWorkQty != null}
                aria-describedby="task-work-hint"
                {...form.register("totalWorkQty")}
              />
              <p id="task-work-hint" className="text-muted-foreground text-xs">
                Leave empty to record progress as a percentage.
              </p>
              <FieldError message={errors.totalWorkQty?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-unit">Unit</Label>
              <Controller
                control={form.control}
                name="totalWorkUnitId"
                render={({ field }) => (
                  <OptionSelect
                    id="task-unit"
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="None"
                    items={units}
                    invalid={errors.totalWorkUnitId != null}
                  />
                )}
              />
              <FieldError message={errors.totalWorkUnitId?.message} />
            </div>
            {financial && (
              <div className="space-y-1.5">
                <Label htmlFor="task-price">Total Price</Label>
                <MoneyInput
                  id="task-price"
                  aria-invalid={errors.totalPrice != null}
                  {...form.register("totalPrice")}
                />
                <FieldError message={errors.totalPrice?.message} />
              </div>
            )}
          </div>
        </fieldset>
      )}

      <FormAlert message={error ?? undefined} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            router.back();
          }}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
