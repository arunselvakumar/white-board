"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { normalizeMobile } from "@repo/auth/construction/mobile";
import { Building2, FileText, ListPlus, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type FieldErrors,
} from "react-hook-form";
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
import { Switch } from "@repo/ui/components/switch";
import { Textarea } from "@repo/ui/components/textarea";

import { PageHeader } from "@/components/app-shell/page-header";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { MobileField } from "@/components/auth/mobile-field";
import { MoneyInput, rupeesToPaise } from "@/components/money/money-input";
import { ImageUploader } from "@/components/profile/image-uploader";
import {
  useUploadHeldFiles,
  type HeldFile,
} from "@/components/projects/documents/document-attachments";
import { fieldForCode } from "@/lib/server-errors";
import { PROJECT_TYPES } from "@/src/projects/domain/project-type";
import {
  projectsQuery,
  useApplyProjectLogo,
  useCreateProject,
  useDeleteProject,
  useUpdateProject,
  type ProjectLogoChange,
  type ProjectResponse,
} from "@/src/queries/projects";
import { isCalendarDate } from "@/src/shared-kernel/calendar-date";
import { GST_STATES } from "@/src/shared-kernel/gst-states";

import { ContractPapersField } from "./contract-papers-field";
import { CustomFieldsField } from "./custom-fields-field";
import { CollapsibleFormCard, FormCard } from "./form-card";
import {
  clientPhoneLabel,
  groupRupees,
  orderValueLabel,
  PROJECT_PAPERS,
  type ProjectPaperKind,
} from "./project-contract";
import {
  failedUploadsMessage,
  LOGO_FAILED_MESSAGE,
  setProjectFlash,
} from "./project-flash";
import {
  cardOf,
  FIELD_ORDER,
  newProjectFormSchema,
  projectFormInput,
  projectFormSchema,
  projectFormValues,
  serverField,
  type ProjectFormCard,
  type ProjectFormField,
  type ProjectFormInput,
  type ProjectFormValues,
} from "./project-form-schema";
import { PROJECTS_PATH, projectPath } from "./projects-home";
import { resourcesStepPath } from "./resources/resources-step";
import {
  formatCalendarDate,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_ORDER,
  projectInitials,
} from "./project-status";

const STATUS_ITEMS = PROJECT_STATUS_ORDER.map((status) => ({
  value: status,
  label: PROJECT_STATUS_LABELS[status],
}));

const TYPE_ITEMS = PROJECT_TYPES.map((type) => ({
  value: type.key,
  label: type.label,
}));

/** The State select's "Not set" item; the form keeps "" for it. */
const NO_STATE = "none";

const STATE_ITEMS = [
  { value: NO_STATE, label: "Not set" },
  ...GST_STATES.map((state) => ({ value: state.code, label: state.name })),
];

const KEEP_LOGO: ProjectLogoChange = { kind: "keep" };

/** A preview URL for a picked logo file, revoked when it changes. */
function usePickedLogoUrl(logo: ProjectLogoChange): string | null {
  const file = logo.kind === "set" ? logo.file : null;
  const url = useMemo(
    () => (file == null ? null : URL.createObjectURL(file)),
    [file],
  );
  useEffect(
    () => () => {
      if (url != null) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url;
}

type OptionalCard = Exclude<ProjectFormCard, "project">;

const filled = (value: string) => value.trim() !== "";

function clientSummary(values: ProjectFormValues): string | null {
  const phone = normalizeMobile(values.clientPhone);
  const parts = [
    values.clientName.trim(),
    phone == null ? values.clientPhone.trim() : clientPhoneLabel(phone),
  ].filter(filled);
  return parts.length === 0 ? null : parts.join(" · ");
}

function contractSummary(
  values: ProjectFormValues,
  heldCount: number,
): string | null {
  const parts: string[] = [];
  const paise = rupeesToPaise(values.orderValue);
  if (paise != null && !Number.isNaN(paise))
    parts.push(`${orderValueLabel(paise)} excl. GST`);
  for (const paper of PROJECT_PAPERS) {
    const number = values[paper.numberField].trim();
    const date = paper.dateField == null ? "" : values[paper.dateField];
    if (number !== "") parts.push(`${paper.label} ${number}`);
    else if (isCalendarDate(date))
      parts.push(`${paper.label} ${formatCalendarDate(date)}`);
  }
  if (heldCount > 0)
    parts.push(heldCount === 1 ? "1 file" : `${String(heldCount)} files`);
  return parts.length === 0 ? null : parts.join(" · ");
}

function customFieldCount(values: ProjectFormValues): number {
  return values.customFields.filter(
    (row) => filled(row.label) || filled(row.value),
  ).length;
}

function hasContract(values: ProjectFormValues): boolean {
  return (
    filled(values.orderValue) ||
    PROJECT_PAPERS.some(
      (paper) =>
        filled(values[paper.numberField]) ||
        (paper.dateField != null && filled(values[paper.dateField])),
    )
  );
}

/** Optional papers with something in them start on screen. */
function papersWithValues(values: ProjectFormValues): Set<ProjectPaperKind> {
  return new Set(
    PROJECT_PAPERS.filter(
      (paper) =>
        paper.optional &&
        (filled(values[paper.numberField]) ||
          (paper.dateField != null && filled(values[paper.dateField]))),
    ).map((paper) => paper.kind),
  );
}

/** Error paths in screen order: contract fields, then custom-field rows. */
function errorFields(errors: FieldErrors<ProjectFormValues>): string[] {
  const top = FIELD_ORDER.filter(
    (field) => errors[field as keyof ProjectFormValues] != null,
  );
  const rows = Array.isArray(errors.customFields)
    ? (errors.customFields as (
        FieldErrors<ProjectFormValues["customFields"][number]> | undefined
      )[])
    : [];
  const custom = rows.flatMap((row, index) =>
    row == null
      ? []
      : (["label", "value"] as const)
          .filter((part) => row[part] != null)
          .map((part) => `customFields.${String(index)}.${part}`),
  );
  if (custom.length === 0 && errors.customFields != null)
    custom.push("customFields");
  return [...top, ...custom];
}

const PROGRESS_LABEL = (done: number, total: number) =>
  `Uploading files ${String(Math.min(done + 1, total))} of ${String(total)}…`;

/**
 * Add and Edit Project (CM-204, CM-413) as four cards: Project (always
 * open), then Client, Contract and Additional details, which are optional
 * and fold up to a one-line summary. On Add they start closed; on Edit a
 * card starts open when it has something in it. A card with an error opens
 * and its field takes focus.
 *
 * The Project card also holds the Project Type, the Budget and the logo
 * with "Use Project logo on reports" (CM-401). Budget and Order value show
 * only to a viewer with the Project menu's Financial flag. A picked or
 * removed logo waits until the Project is saved, then goes through its own
 * route.
 */
function ProjectForm({
  project,
  financial,
  saving,
  savingLabel,
  submitLabel,
  cancelHref,
  onSave,
}: {
  project: ProjectResponse | null;
  /** The Project menu's Financial flag: Budget and Order value show. */
  financial: boolean;
  saving: boolean;
  /** The button while saving; "Saving…" unless the screen says more. */
  savingLabel?: string;
  submitLabel: string;
  cancelHref: string;
  onSave: (
    input: ProjectFormInput,
    held: HeldFile[],
    logo: ProjectLogoChange,
  ) => Promise<void>;
}) {
  const [initial] = useState(() => projectFormValues(project));
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(
      project == null ? newProjectFormSchema : projectFormSchema,
    ),
    defaultValues: initial,
    shouldFocusError: false,
  });
  const errors = form.formState.errors;
  const customFields = useFieldArray({
    control: form.control,
    name: "customFields",
  });
  const values = useWatch({ control: form.control }) as ProjectFormValues;

  const [open, setOpen] = useState<Record<OptionalCard, boolean>>(() => ({
    client:
      project != null &&
      (filled(initial.clientName) || filled(initial.clientPhone)),
    contract: project != null && hasContract(initial),
    more: project != null && customFieldCount(initial) > 0,
  }));
  const [shown, setShown] = useState(() => papersWithValues(initial));
  const [held, setHeld] = useState<HeldFile[]>([]);
  const [logo, setLogo] = useState<ProjectLogoChange>(KEEP_LOGO);
  const pickedLogoUrl = usePickedLogoUrl(logo);
  const logoUrl =
    logo.kind === "set"
      ? pickedLogoUrl
      : logo.kind === "remove"
        ? null
        : (project?.logoUrl ?? null);
  const budgetField = form.register("budgetValue");
  const [focus, setFocus] = useState<string | null>(null);

  // Focus after the card or row it is in has rendered.
  useEffect(() => {
    if (focus == null) return;
    const frame = requestAnimationFrame(() => {
      form.setFocus(focus as ProjectFormField);
      setFocus(null);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [focus, form]);

  const reveal = (fields: readonly string[]) => {
    const cards = new Set(fields.map(cardOf));
    setOpen((current) => ({
      client: current.client || cards.has("client"),
      contract: current.contract || cards.has("contract"),
      more: current.more || cards.has("more"),
    }));
    const first = fields[0];
    if (first != null) setFocus(first);
  };

  const submit = form.handleSubmit(
    async (valid) => {
      const { input, customFieldRows } = projectFormInput(
        valid,
        project,
        financial,
      );
      try {
        await onSave(input, held, logo);
      } catch (error) {
        const field = serverField(error, customFieldRows);
        const { message } = fieldForCode(error, {});
        if (field == null) {
          form.setError("root", { message });
          return;
        }
        form.setError(field, { message });
        reveal([field]);
      }
    },
    (invalid) => {
      reveal(errorFields(invalid));
    },
  );

  const toggle = (card: OptionalCard) => (next: boolean) => {
    setOpen((current) => ({ ...current, [card]: next }));
  };

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <FormCard icon={<Building2 />} title="Project">
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
            <Label htmlFor="project-type">Project Type</Label>
            <Controller
              name="projectType"
              control={form.control}
              render={({ field }) => (
                <Select
                  items={TYPE_ITEMS}
                  value={field.value === "" ? null : field.value}
                  onValueChange={(value) => {
                    if (value != null) field.onChange(value);
                  }}
                >
                  <SelectTrigger
                    id="project-type"
                    ref={field.ref}
                    size="lg"
                    className="w-full min-w-0"
                    aria-invalid={errors.projectType != null}
                    aria-describedby="project-type-hint"
                  >
                    <SelectValue
                      placeholder={
                        project == null ? "Choose a type" : "Not set"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent
                    align="start"
                    alignItemWithTrigger={false}
                    aria-label="Project Types"
                  >
                    {TYPE_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p id="project-type-hint" className="text-muted-foreground text-xs">
              Decides whether the Project is built up as Wings or as Locations.
            </p>
            <FieldError message={errors.projectType?.message} />
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
                    ref={field.ref}
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
          {financial ? (
            <div className="space-y-1.5">
              <Label htmlFor="project-budget">Budget</Label>
              <MoneyInput
                id="project-budget"
                className="h-10"
                placeholder="3,20,00,000"
                aria-invalid={errors.budgetValue != null}
                aria-describedby="project-budget-hint"
                {...budgetField}
                onBlur={(event) => {
                  void budgetField.onBlur(event);
                  const grouped = groupRupees(event.target.value);
                  if (grouped !== event.target.value)
                    form.setValue("budgetValue", grouped);
                }}
              />
              <p
                id="project-budget-hint"
                className="text-muted-foreground text-xs"
              >
                Your own figure for the job; shown on the Project Dashboard.
              </p>
              <FieldError message={errors.budgetValue?.message} />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="project-state">State</Label>
            <Controller
              name="stateCode"
              control={form.control}
              render={({ field }) => (
                <Select
                  items={STATE_ITEMS}
                  value={field.value === "" ? NO_STATE : field.value}
                  onValueChange={(value) => {
                    if (value != null)
                      field.onChange(value === NO_STATE ? "" : value);
                  }}
                >
                  <SelectTrigger
                    id="project-state"
                    ref={field.ref}
                    size="lg"
                    className="w-full min-w-0"
                    aria-invalid={errors.stateCode != null}
                    aria-describedby="project-state-hint"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    align="start"
                    alignItemWithTrigger={false}
                    aria-label="States"
                  >
                    {STATE_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p
              id="project-state-hint"
              className="text-muted-foreground text-xs"
            >
              The place of supply on the Project&apos;s Purchase Orders.
            </p>
            <FieldError message={errors.stateCode?.message} />
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
          <div className="space-y-3 border-t pt-4 sm:col-span-2">
            <div>
              <h3 className="text-sm font-medium">Project logo</h3>
              <p className="text-muted-foreground text-xs">
                Shown on the Projects home and at the top of the Project.
              </p>
            </div>
            <ImageUploader
              kind="project_logo"
              noun="logo"
              shape="square"
              imageUrl={logoUrl}
              fallback={
                values.name.trim() === "" ? (
                  <Building2 aria-hidden="true" />
                ) : (
                  projectInitials(values.name.trim())
                )
              }
              hint="PNG, JPEG or WebP, up to 2 MB. Saved with the Project."
              disabled={saving}
              onUpload={(file) => {
                setLogo({ kind: "set", file });
                return Promise.resolve();
              }}
              onRemove={() => {
                setLogo(
                  project?.logoUrl == null ? KEEP_LOGO : { kind: "remove" },
                );
                return Promise.resolve();
              }}
            />
            <Controller
              name="useLogoInReports"
              control={form.control}
              render={({ field }) => (
                <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                  <div className="min-w-0 space-y-0.5">
                    <Label htmlFor="project-logo-reports">
                      Use Project logo on reports
                    </Label>
                    <p
                      id="project-logo-reports-hint"
                      className="text-muted-foreground text-xs"
                    >
                      Report headers print this logo instead of the
                      Company&apos;s.
                    </p>
                  </div>
                  <Switch
                    id="project-logo-reports"
                    aria-describedby="project-logo-reports-hint"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </div>
              )}
            />
          </div>
        </div>
      </FormCard>

      <CollapsibleFormCard
        icon={<UserRound />}
        title="Client"
        summary={clientSummary(values)}
        open={open.client}
        onOpenChange={toggle("client")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="project-client-name">Client name</Label>
            <Input
              id="project-client-name"
              className="h-10"
              autoComplete="off"
              placeholder="Sri Balaji Developers"
              aria-invalid={errors.clientName != null}
              {...form.register("clientName")}
            />
            <FieldError message={errors.clientName?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-client-phone">Client mobile</Label>
            <MobileField
              id="project-client-phone"
              autoComplete="off"
              placeholder="98431 22110"
              aria-invalid={errors.clientPhone != null}
              {...form.register("clientPhone")}
            />
            <FieldError message={errors.clientPhone?.message} />
          </div>
        </div>
      </CollapsibleFormCard>

      <CollapsibleFormCard
        icon={<FileText />}
        title="Contract"
        summary={contractSummary(values, held.length)}
        open={open.contract}
        onOpenChange={toggle("contract")}
      >
        <ContractPapersField
          form={form}
          financial={financial}
          projectId={project?.id ?? null}
          shown={shown}
          onShow={(kind) => {
            setShown((current) => new Set(current).add(kind));
            const paper = PROJECT_PAPERS.find((item) => item.kind === kind);
            if (paper != null) setFocus(paper.numberField);
          }}
          held={held}
          onHeldChange={(kind, next) => {
            setHeld((current) => [
              ...current.filter((file) => file.kind !== kind),
              ...next.filter((file) => file.kind === kind),
            ]);
          }}
          disabled={saving}
        />
      </CollapsibleFormCard>

      <CollapsibleFormCard
        icon={<ListPlus />}
        title="Additional details"
        summary={(() => {
          const count = customFieldCount(values);
          if (count === 0) return null;
          return count === 1 ? "1 field" : `${String(count)} fields`;
        })()}
        open={open.more}
        onOpenChange={toggle("more")}
      >
        <CustomFieldsField
          form={form}
          fields={customFields.fields}
          onAdd={() => {
            customFields.append({ label: "", value: "" });
            setFocus(
              `customFields.${String(customFields.fields.length)}.label`,
            );
          }}
          onRemove={(index) => {
            customFields.remove(index);
          }}
        />
      </CollapsibleFormCard>

      <FormAlert message={errors.root?.message} />
      <div className="flex flex-wrap gap-2 pt-2">
        <Button type="submit" disabled={saving}>
          {saving ? (savingLabel ?? "Saving…") : submitLabel}
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

/**
 * New Project (`/app/projects/new`). The logo and the files picked under
 * Contract wait until the Project exists, then upload; the Project opens
 * either way, on its Resources as step 2 of 2 (CM-406), and its Overview
 * says what did not make it.
 */
export function NewProjectScreen() {
  const router = useRouter();
  const { data: list } = useSuspenseQuery(projectsQuery);
  const create = useCreateProject();
  const applyLogo = useApplyProjectLogo();
  const uploads = useUploadHeldFiles();
  const [uploading, setUploading] = useState<number | null>(null);
  const [savingLogo, setSavingLogo] = useState(false);
  const progress =
    uploads.status ??
    (uploading == null ? null : { done: 0, total: uploading });
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Projects", href: PROJECTS_PATH }}
          title="New Project"
          meta="Name it now; client, contract and dates can follow."
        />
        <ProjectForm
          project={null}
          financial={list.financial}
          saving={create.isPending || savingLogo || uploading != null}
          savingLabel={
            progress != null
              ? PROGRESS_LABEL(progress.done, progress.total)
              : savingLogo
                ? "Saving the logo…"
                : undefined
          }
          submitLabel="Add Project"
          cancelHref={PROJECTS_PATH}
          onSave={async (input, held, logo) => {
            const created = await create.mutateAsync(input);
            const messages: string[] = [];
            if (logo.kind !== "keep") {
              setSavingLogo(true);
              if (!(await applyLogo(created.id, logo)))
                messages.push(LOGO_FAILED_MESSAGE);
            }
            if (held.length > 0) {
              setUploading(held.length);
              let failed: readonly HeldFile[];
              try {
                ({ failed } = await uploads.upload(created.id, held));
              } catch {
                failed = held;
              }
              if (failed.length > 0)
                messages.push(failedUploadsMessage(failed.length));
            }
            if (messages.length > 0)
              setProjectFlash(created.id, messages.join(" "));
            router.push(resourcesStepPath(created.id));
          }}
        />
      </div>
    </div>
  );
}

/**
 * Edit Project inside the project shell, with Delete below the form. A
 * logo change is applied once the form is saved.
 */
export function EditProjectForm({
  project,
  financial,
}: {
  project: ProjectResponse;
  /** The Project menu's Financial flag. */
  financial: boolean;
}) {
  const router = useRouter();
  const update = useUpdateProject(project.id);
  const applyLogo = useApplyProjectLogo();
  const [savingLogo, setSavingLogo] = useState(false);
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
            financial={financial}
            saving={update.isPending || savingLogo}
            submitLabel="Save"
            cancelHref={projectPath(project.id)}
            onSave={async (input, _held, logo) => {
              await update.mutateAsync({
                ...input,
                expectedUpdatedAt: project.updatedAt,
              });
              if (logo.kind !== "keep") {
                setSavingLogo(true);
                if (!(await applyLogo(project.id, logo)))
                  setProjectFlash(project.id, LOGO_FAILED_MESSAGE);
              }
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
            Only a Project with no labours, vendors, attendance, payments,
            documents, Wings, Locations, drawings or testing reports can be
            deleted. Mark a finished Project Completed instead.
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
