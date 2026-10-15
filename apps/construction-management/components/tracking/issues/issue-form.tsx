"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { Controller, useForm, type FieldPath } from "react-hook-form";
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
import { localToday } from "@/components/payments/payment-format";
import { TrackingPendingFilesField } from "@/components/tracking/documents/tracking-pending-files-field";
import { useUploadPendingTrackingFiles } from "@/components/tracking/documents/use-upload-pending-tracking-files";
import { QueryHttpError } from "@/src/queries/http";
import {
  issueFormOptionsQuery,
  issuesPath,
  useCreateIssue,
  useUpdateIssue,
  type CreateIssueInput,
  type IssueDetail,
} from "@/src/queries/tracking-issues";
import type { LocationRef } from "@/src/shared-kernel/location-ref";
import { ISSUE_LIMITS } from "@/src/tracking/domain/issue";
import {
  TRACKING_PRIORITIES,
  type TrackingPriority,
} from "@/src/tracking/domain/tracking-documents";

import { PriorityChip } from "./issue-parts";

const NONE = "none";

const schema = z
  .object({
    issueDate: z.string().min(1, "Choose the Issue Date."),
    details: z
      .string()
      .max(
        ISSUE_LIMITS.details,
        `Use at most ${String(ISSUE_LIMITS.details)} characters.`,
      )
      .trim()
      .min(1, "Describe the issue."),
    priority: z.string(),
    categoryId: z.string(),
    departmentId: z.string(),
    contractorId: z.string(),
    assigneeMemberId: z.string(),
    dueDate: z.string(),
    siteLocation: z.custom<LocationRef | null>(),
    /** Picked on a new issue; uploaded once it is saved. */
    images: z.custom<File[]>(),
    attachments: z.custom<File[]>(),
  })
  .superRefine((value, ctx) => {
    if (value.dueDate !== "" && value.dueDate < value.issueDate)
      ctx.addIssue({
        code: "custom",
        message: "The Due Date cannot be before the Issue Date.",
        path: ["dueDate"],
      });
  });
type Values = z.infer<typeof schema>;

/** Server fields (`details.field`) to the form's. */
const SERVER_FIELDS: Record<string, FieldPath<Values>> = {
  issueDate: "issueDate",
  details: "details",
  priority: "priority",
  categoryId: "categoryId",
  departmentId: "departmentId",
  contractorId: "contractorId",
  assigneeMemberId: "assigneeMemberId",
  dueDate: "dueDate",
  siteLocation: "siteLocation",
};

/** Back-dated entry refusals are about the Issue Date. */
const DATE_CODES = new Set([
  "BACKDATED_CREATE_BLOCKED",
  "BACKDATED_EDIT_BLOCKED",
  "FINANCIAL_PERIOD_CLOSED",
]);

function defaults(issue: IssueDetail | undefined): Values {
  return {
    issueDate: issue?.issueDate ?? localToday(),
    details: issue?.details ?? "",
    priority: issue?.priority ?? "",
    categoryId: issue?.category?.id ?? "",
    departmentId: issue?.department?.id ?? "",
    contractorId: issue?.contractor?.id ?? "",
    assigneeMemberId: issue?.assignee?.id ?? "",
    dueDate: issue?.dueDate ?? "",
    siteLocation: issue?.siteLocation ?? null,
    images: [],
    attachments: [],
  };
}

type Option = { value: string; label: string; content?: ReactNode };

/** A Select with a "None" first item; `""` is none. */
function OptionSelect({
  id,
  value,
  onChange,
  items,
  placeholder,
  noneLabel,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  items: readonly Option[];
  placeholder: string;
  noneLabel: string;
  invalid?: boolean;
}) {
  const all: Option[] = [{ value: NONE, label: noneLabel }, ...items];
  return (
    <Select
      items={all.map(({ value: key, label }) => ({ value: key, label }))}
      value={value === "" ? null : value}
      onValueChange={(next) => {
        if (next == null) return;
        onChange(next === NONE ? "" : next);
      }}
    >
      <SelectTrigger id={id} className="w-full min-w-0" aria-invalid={invalid}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {all.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.content ?? item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Keeps an unchanged pick the options no longer offer (disabled, left the Project). */
function withCurrent(
  options: Option[],
  current: { id: string; name: string | null } | null | undefined,
  missing: string,
): Option[] {
  if (current == null || options.some((item) => item.value === current.id))
    return options;
  return [
    ...options,
    {
      value: current.id,
      label: `${current.name ?? "A removed entry"} (${missing})`,
    },
  ];
}

/**
 * Raise or edit an Issue & Snag (CM-803, ADR CM-0019 §7): Issue Date
 * (back-dated control), Details, Priority (colour and label), Category,
 * Department, Contractor, Assign To, Due Date (on or after the Issue
 * Date) and Location; on a new issue its images and attachments, uploaded
 * once it is saved. **Save** raises it Pending; **Save & Mark As Solved**
 * (Create and Update) records one fixed on the spot. The form stays busy
 * after a save until the issue's page opens.
 */
export function IssueForm({
  projectId,
  issue,
  canSolve = false,
}: {
  projectId: string;
  /** Edit this (open) issue. */
  issue?: IssueDetail;
  /** Offer Save & Mark As Solved (the viewer holds Update too). */
  canSolve?: boolean;
}) {
  const router = useRouter();
  const { data: options } = useSuspenseQuery(issueFormOptionsQuery(projectId));
  const create = useCreateIssue();
  const update = useUpdateIssue(issue?.id ?? "");
  const uploads = useUploadPendingTrackingFiles("issue");
  const [error, setError] = useState<string | null>(null);
  /** Saved: busy until the next page opens (no double submit). */
  const [leaving, setLeaving] = useState(false);
  const [solving, setSolving] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults(issue),
  });
  const errors = form.formState.errors;

  const members = withCurrent(
    options.members.map((member) => ({
      value: member.id,
      label: member.isOwner ? `${member.name} (Owner)` : member.name,
    })),
    issue?.assignee,
    "not on this Project",
  );
  const categories = withCurrent(
    options.issueCategories.map((item) => ({
      value: item.id,
      label: item.name,
    })),
    issue?.category,
    "disabled",
  );
  const departments = withCurrent(
    options.departments.map((item) => ({ value: item.id, label: item.name })),
    issue?.department,
    "disabled",
  );
  const contractors = withCurrent(
    options.contractors.map((item) => ({ value: item.id, label: item.name })),
    issue?.contractor,
    "not on this Project",
  );

  const save = (markSolved: boolean) =>
    form.handleSubmit(async (input) => {
      setError(null);
      setSolving(markSolved);
      const orNull = (value: string) => (value === "" ? null : value);
      const body = {
        issueDate: input.issueDate,
        details: input.details.trim(),
        priority: orNull(input.priority) as TrackingPriority | null,
        categoryId: orNull(input.categoryId),
        departmentId: orNull(input.departmentId),
        contractorId: orNull(input.contractorId),
        assigneeMemberId: orNull(input.assigneeMemberId),
        dueDate: orNull(input.dueDate),
        siteLocation: input.siteLocation as CreateIssueInput["siteLocation"],
      };
      try {
        const saved =
          issue == null
            ? await create.mutateAsync({ ...body, projectId, markSolved })
            : await update.mutateAsync({
                ...body,
                expectedUpdatedAt: issue.updatedAt,
              });
        setLeaving(true);
        // A file that does not go up can be added again on the issue's page.
        if (issue == null)
          await uploads.uploadAll(saved.id, [
            ...input.images,
            ...input.attachments,
          ]);
        router.push(issuesPath(projectId, saved.id));
      } catch (caught) {
        setLeaving(false);
        if (caught instanceof QueryHttpError) {
          if (DATE_CODES.has(caught.code)) {
            form.setError("issueDate", { message: caught.message });
            return;
          }
          const raw = (caught.details as { field?: unknown } | undefined)
            ?.field;
          const field =
            typeof raw === "string" ? SERVER_FIELDS[raw] : undefined;
          if (field != null) {
            form.setError(field, { message: caught.message });
            return;
          }
          setError(caught.message);
          return;
        }
        setError("Something went wrong. Please try again.");
      }
    });

  const busy = form.formState.isSubmitting || uploads.uploading || leaving;

  return (
    <form
      noValidate
      aria-label={issue == null ? "New issue" : `Edit ${issue.number}`}
      className="w-full max-w-4xl space-y-6"
      onSubmit={(event) => {
        void save(false)(event);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="issue-date">Issue Date</Label>
          <Input
            id="issue-date"
            type="date"
            max={localToday()}
            aria-invalid={errors.issueDate != null}
            {...form.register("issueDate")}
          />
          <FieldError message={errors.issueDate?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="issue-priority">Priority</Label>
          <Controller
            control={form.control}
            name="priority"
            render={({ field }) => (
              <OptionSelect
                id="issue-priority"
                value={field.value}
                onChange={field.onChange}
                placeholder="No priority"
                noneLabel="No priority"
                invalid={errors.priority != null}
                items={TRACKING_PRIORITIES.map((item) => ({
                  value: item.key,
                  label: item.label,
                  content: <PriorityChip priority={item.key} />,
                }))}
              />
            )}
          />
          <FieldError message={errors.priority?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="issue-due">Due Date</Label>
          <Input
            id="issue-due"
            type="date"
            aria-invalid={errors.dueDate != null}
            aria-describedby="issue-due-hint"
            {...form.register("dueDate")}
          />
          <p id="issue-due-hint" className="text-muted-foreground text-xs">
            Past it, an open issue shows Delayed.
          </p>
          <FieldError message={errors.dueDate?.message} />
        </div>
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="issue-details">Details</Label>
          <Textarea
            id="issue-details"
            rows={3}
            aria-invalid={errors.details != null}
            {...form.register("details")}
          />
          <FieldError message={errors.details?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="issue-category">Category</Label>
          <Controller
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <OptionSelect
                id="issue-category"
                value={field.value}
                onChange={field.onChange}
                placeholder="No category"
                noneLabel="No category"
                invalid={errors.categoryId != null}
                items={categories}
              />
            )}
          />
          <FieldError message={errors.categoryId?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="issue-department">Department</Label>
          <Controller
            control={form.control}
            name="departmentId"
            render={({ field }) => (
              <OptionSelect
                id="issue-department"
                value={field.value}
                onChange={field.onChange}
                placeholder="No department"
                noneLabel="No department"
                invalid={errors.departmentId != null}
                items={departments}
              />
            )}
          />
          <FieldError message={errors.departmentId?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="issue-contractor">Contractor</Label>
          <Controller
            control={form.control}
            name="contractorId"
            render={({ field }) => (
              <OptionSelect
                id="issue-contractor"
                value={field.value}
                onChange={field.onChange}
                placeholder={
                  contractors.length === 0
                    ? "No Contractors on this Project"
                    : "No Contractor"
                }
                noneLabel="No Contractor"
                invalid={errors.contractorId != null}
                items={contractors}
              />
            )}
          />
          <FieldError message={errors.contractorId?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="issue-assignee">Assign To</Label>
          <Controller
            control={form.control}
            name="assigneeMemberId"
            render={({ field }) => (
              <OptionSelect
                id="issue-assignee"
                value={field.value}
                onChange={field.onChange}
                placeholder="No one"
                noneLabel="No one"
                invalid={errors.assigneeMemberId != null}
                items={members}
              />
            )}
          />
          <FieldError message={errors.assigneeMemberId?.message} />
        </div>
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
          <Suspense fallback={null}>
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
          </Suspense>
          <FieldError message={errors.siteLocation?.message} />
        </div>
      </div>

      {issue == null ? (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <Controller
            control={form.control}
            name="images"
            render={({ field }) => (
              <TrackingPendingFilesField
                documentType="issue"
                photosOnly
                label="Images"
                value={field.value}
                onChange={field.onChange}
                disabled={busy}
              />
            )}
          />
          <Controller
            control={form.control}
            name="attachments"
            render={({ field }) => (
              <TrackingPendingFilesField
                documentType="issue"
                label="Attachments"
                value={field.value}
                onChange={field.onChange}
                disabled={busy}
              />
            )}
          />
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Add or remove images and attachments on the issue&apos;s page.
        </p>
      )}

      <FormAlert message={error ?? undefined} />
      {uploads.uploading && (
        <p role="status" className="text-muted-foreground text-sm">
          Uploading {String(uploads.done + 1)} of {String(uploads.total)}…
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            router.back();
          }}
        >
          Cancel
        </Button>
        {issue == null && canSolve && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              void save(true)();
            }}
          >
            {busy && solving ? "Saving…" : "Save & Mark As Solved"}
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {busy && !solving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
