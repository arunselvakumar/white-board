"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Controller, useForm, type FieldPath } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@repo/ui/components/combobox";
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
  inspectionFormOptionsQuery,
  inspectionsPath,
  useCreateInspection,
  useUpdateInspection,
  type CreateInspectionInput,
  type Inspection,
  type InspectionFormOptions,
  type InspectionReinspection,
} from "@/src/queries/tracking-inspections";
import type { LocationRef } from "@/src/shared-kernel/location-ref";
import { INSPECTION_LIMITS } from "@/src/tracking/domain/inspection";
import { LocationPickerSkeleton } from "@/components/locations/locations-skeletons";

const NONE = "none";

const schema = z.object({
  inspectionDate: z.string().min(1, "Choose the inspection date."),
  inspectionTime: z
    .string()
    .refine(
      (value) => value === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
      "Enter the time as HH:MM.",
    ),
  departmentId: z.string(),
  contractorId: z.string(),
  inspectorMemberId: z.string(),
  workDescription: z
    .string()
    .trim()
    .min(1, "Describe the work to inspect.")
    .max(
      INSPECTION_LIMITS.workDescription,
      `Use at most ${String(INSPECTION_LIMITS.workDescription)} characters.`,
    ),
  siteLocation: z.custom<LocationRef | null>(),
  drawingIds: z.array(z.string()),
  /** Picked on a new request; uploaded once it is saved. */
  files: z.custom<File[]>(),
});
type Values = z.infer<typeof schema>;

/** Server fields to the form's field names. */
const SERVER_FIELDS: Record<string, FieldPath<Values>> = {
  inspectionDate: "inspectionDate",
  inspectionTime: "inspectionTime",
  departmentId: "departmentId",
  contractorId: "contractorId",
  inspectorMemberId: "inspectorMemberId",
  workDescription: "workDescription",
  drawingIds: "drawingIds",
  type: "siteLocation",
  wingId: "siteLocation",
  floorIds: "siteLocation",
  unitIds: "siteLocation",
  developmentId: "siteLocation",
  locationId: "siteLocation",
};

const DATE_CODES = new Set([
  "BACKDATED_CREATE_BLOCKED",
  "BACKDATED_EDIT_BLOCKED",
  "FINANCIAL_PERIOD_CLOSED",
]);

type Option = { value: string; label: string };
type DrawingOption = { id: string; label: string };

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
  items: readonly Option[];
  placeholder: string;
  invalid?: boolean;
}) {
  return (
    <Select
      items={items}
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
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Pick any number of the Project's Drawings (CM-0019 §9). */
function DrawingsPicker({
  id,
  options,
  value,
  onChange,
  disabled,
}: {
  id: string;
  options: readonly DrawingOption[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const anchor = useComboboxAnchor();
  const selected = useMemo(
    () => options.filter((item) => value.includes(item.id)),
    [options, value],
  );
  return (
    <Combobox
      items={options as DrawingOption[]}
      multiple
      value={selected}
      disabled={disabled}
      itemToStringLabel={(item: DrawingOption) => item.label}
      isItemEqualToValue={(item: DrawingOption, other: DrawingOption) =>
        item.id === other.id
      }
      onValueChange={(next: DrawingOption[]) => {
        onChange(next.map((item) => item.id));
      }}
    >
      <ComboboxChips ref={anchor} className="min-h-10 w-full min-w-0">
        <ComboboxValue>
          {(items: DrawingOption[]) => (
            <>
              {items.map((item) => (
                <ComboboxChip
                  key={item.id}
                  aria-label={item.label}
                  removeLabel={`Remove ${item.label}`}
                  className="max-w-full"
                >
                  <span className="truncate">{item.label}</span>
                </ComboboxChip>
              ))}
              <ComboboxChipsInput
                id={id}
                disabled={disabled}
                placeholder={
                  items.length > 0
                    ? ""
                    : options.length === 0
                      ? "No drawings on this Project"
                      : "Pick drawings"
                }
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No drawings found.</ComboboxEmpty>
        <ComboboxList aria-label="Project Drawings">
          {(item: DrawingOption) => (
            <ComboboxItem key={item.id} value={item}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function defaults(
  inspection: Inspection | undefined,
  reinspection: InspectionReinspection | undefined,
  today: string,
): Values {
  if (inspection != null)
    return {
      inspectionDate: inspection.inspectionDate,
      inspectionTime: inspection.inspectionTime ?? "",
      departmentId: inspection.department?.id ?? "",
      contractorId: inspection.contractor?.id ?? "",
      inspectorMemberId: inspection.inspector?.memberId ?? "",
      workDescription: inspection.workDescription,
      siteLocation: inspection.siteLocation,
      drawingIds: inspection.drawings.map((item) => item.id),
      files: [],
    };
  return {
    inspectionDate: today,
    inspectionTime: "",
    departmentId: reinspection?.departmentId ?? "",
    contractorId: reinspection?.contractorId ?? "",
    inspectorMemberId: reinspection?.inspectorMemberId ?? "",
    workDescription: reinspection?.workDescription ?? "",
    siteLocation: reinspection?.siteLocation ?? null,
    drawingIds: reinspection?.drawingIds ?? [],
    files: [],
  };
}

/** Options, plus an edited request's current picks that are no longer offered. */
function choices(
  options: InspectionFormOptions,
  inspection: Inspection | undefined,
) {
  const members: Option[] = [
    { value: NONE, label: "No one yet" },
    ...options.members.map((m) => ({
      value: m.id,
      label: m.isOwner ? `${m.name} (Owner)` : m.name,
    })),
  ];
  const departments: Option[] = [
    { value: NONE, label: "None" },
    ...options.departments.map((d) => ({ value: d.id, label: d.name })),
  ];
  const contractors: Option[] = [
    { value: NONE, label: "None" },
    ...options.contractors.map((c) => ({ value: c.id, label: c.name })),
  ];
  const drawings: DrawingOption[] = options.drawings.map((d) => ({
    id: d.id,
    label: `${d.albumName} · ${d.name}${d.revision == null ? "" : ` (R${String(d.revision)})`}`,
  }));
  const keep = (list: Option[], id: string | undefined, name: string) => {
    if (id != null && !list.some((item) => item.value === id))
      list.push({ value: id, label: name });
  };
  if (inspection != null) {
    keep(
      members,
      inspection.inspector?.memberId,
      inspection.inspector?.name ?? "A former member",
    );
    keep(
      departments,
      inspection.department?.id,
      inspection.department?.name ?? "A removed Department",
    );
    keep(
      contractors,
      inspection.contractor?.id,
      inspection.contractor?.name ?? "A removed Contractor",
    );
    for (const drawing of inspection.drawings)
      if (!drawings.some((item) => item.id === drawing.id))
        drawings.push({
          id: drawing.id,
          label: drawing.name ?? "A removed drawing",
        });
  }
  return { members, departments, contractors, drawings };
}

/**
 * Raise or edit an Inspection Request (CM-804, ADR CM-0019 §9): Inspection
 * Date (back-dated policy) and time, Department, Contractor, Inspector
 * (optional), Description of work, location, linked Project Drawings and,
 * on a new request, drawings and site photographs as files uploaded once
 * it is saved. **Raise re-inspection** passes the rejected request's
 * prefill (`reinspection`); the new request links back to it.
 */
export function InspectionForm({
  projectId,
  inspection,
  reinspection,
  reinspectionOfNumber,
  today = localToday(),
}: {
  projectId: string;
  /** Edit this pending request. */
  inspection?: Inspection;
  /** Prefill of a re-inspection (`?reinspect=<id>`). */
  reinspection?: InspectionReinspection;
  /** The rejected request's number, for the banner. */
  reinspectionOfNumber?: string;
  today?: string;
}) {
  const router = useRouter();
  const { data: options } = useSuspenseQuery(
    inspectionFormOptionsQuery(projectId),
  );
  const create = useCreateInspection();
  const update = useUpdateInspection(inspection?.id ?? "");
  const uploads = useUploadPendingTrackingFiles("inspection");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults(inspection, reinspection, today),
  });
  const errors = form.formState.errors;
  const lists = choices(options, inspection);
  // Stays busy once saved: the request's page opens next, and a second
  // press would raise it twice.
  const busy = form.formState.isSubmitting || uploads.uploading || saved;

  const submit = async (input: Values) => {
    setError(null);
    const body = {
      inspectionDate: input.inspectionDate,
      inspectionTime: input.inspectionTime === "" ? null : input.inspectionTime,
      departmentId: input.departmentId === "" ? null : input.departmentId,
      contractorId: input.contractorId === "" ? null : input.contractorId,
      inspectorMemberId:
        input.inspectorMemberId === "" ? null : input.inspectorMemberId,
      workDescription: input.workDescription.trim(),
      siteLocation: input.siteLocation as CreateInspectionInput["siteLocation"],
      drawingIds: input.drawingIds,
    };
    try {
      const result =
        inspection == null
          ? await create.mutateAsync({
              ...body,
              projectId,
              reinspectionOfId: reinspection?.reinspectionOfId ?? null,
            })
          : await update.mutateAsync({
              ...body,
              expectedUpdatedAt: inspection.updatedAt,
            });
      setSaved(true);
      if (inspection == null && input.files.length > 0) {
        const { failed } = await uploads.uploadAll(result.id, input.files);
        if (failed.length > 0) {
          setError(
            `${result.number} was saved, but ${String(failed.length)} ${failed.length === 1 ? "file" : "files"} did not upload (${failed.join(", ")}). Add them on the request.`,
          );
          router.push(inspectionsPath(projectId, `/${result.id}`));
          return;
        }
      }
      router.push(inspectionsPath(projectId, `/${result.id}`));
    } catch (caught) {
      setSaved(false);
      if (caught instanceof QueryHttpError) {
        if (DATE_CODES.has(caught.code)) {
          form.setError("inspectionDate", { message: caught.message });
          return;
        }
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

  return (
    <form
      noValidate
      aria-label={
        inspection == null
          ? "New Inspection Request"
          : `Edit ${inspection.number}`
      }
      className="w-full max-w-4xl space-y-6"
      onSubmit={(event) => {
        void form.handleSubmit(submit)(event);
      }}
    >
      {reinspection != null && (
        <p className="bg-muted/50 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <RotateCcw aria-hidden="true" className="size-4 shrink-0" />
          {reinspectionOfNumber == null
            ? "Re-inspection of a rejected request."
            : `Re-inspection of ${reinspectionOfNumber}, which was rejected.`}
        </p>
      )}

      <div className="bg-card space-y-6 rounded-xl border p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="inspection-date" required>
              Inspection Date
            </Label>
            <Input
              id="inspection-date"
              type="date"
              aria-required
              aria-invalid={errors.inspectionDate != null}
              {...form.register("inspectionDate")}
            />
            <FieldError message={errors.inspectionDate?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inspection-time">Inspection Time</Label>
            <Input
              id="inspection-time"
              type="time"
              aria-invalid={errors.inspectionTime != null}
              {...form.register("inspectionTime")}
            />
            <FieldError message={errors.inspectionTime?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inspection-inspector">Inspector</Label>
            <Controller
              control={form.control}
              name="inspectorMemberId"
              render={({ field }) => (
                <OptionSelect
                  id="inspection-inspector"
                  value={field.value === "" ? NONE : field.value}
                  onChange={field.onChange}
                  placeholder="No one yet"
                  invalid={errors.inspectorMemberId != null}
                  items={lists.members}
                />
              )}
            />
            <FieldError message={errors.inspectorMemberId?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inspection-department">Department</Label>
            <Controller
              control={form.control}
              name="departmentId"
              render={({ field }) => (
                <OptionSelect
                  id="inspection-department"
                  value={field.value === "" ? NONE : field.value}
                  onChange={field.onChange}
                  placeholder="None"
                  invalid={errors.departmentId != null}
                  items={lists.departments}
                />
              )}
            />
            <FieldError message={errors.departmentId?.message} />
          </div>
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="inspection-contractor">Contractor</Label>
            <Controller
              control={form.control}
              name="contractorId"
              render={({ field }) => (
                <OptionSelect
                  id="inspection-contractor"
                  value={field.value === "" ? NONE : field.value}
                  onChange={field.onChange}
                  placeholder="None"
                  invalid={errors.contractorId != null}
                  items={lists.contractors}
                />
              )}
            />
            <FieldError message={errors.contractorId?.message} />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="inspection-work" required>
              Description of work
            </Label>
            <Textarea
              id="inspection-work"
              rows={3}
              aria-required
              aria-invalid={errors.workDescription != null}
              {...form.register("workDescription")}
            />
            <FieldError message={errors.workDescription?.message} />
          </div>
          <div className="min-w-0 space-y-1.5 sm:col-span-2 lg:col-span-3">
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
            </Suspense>
            <FieldError message={errors.siteLocation?.message} />
          </div>
          <div className="min-w-0 space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="inspection-drawings">Linked drawings</Label>
            <Controller
              control={form.control}
              name="drawingIds"
              render={({ field }) => (
                <DrawingsPicker
                  id="inspection-drawings"
                  options={lists.drawings}
                  value={field.value}
                  onChange={field.onChange}
                  disabled={busy}
                />
              )}
            />
            <FieldError message={errors.drawingIds?.message} />
          </div>
        </div>

        {inspection == null && (
          <Controller
            control={form.control}
            name="files"
            render={({ field }) => (
              <TrackingPendingFilesField
                documentType="inspection"
                label="Drawings and site photographs"
                value={field.value}
                onChange={field.onChange}
                disabled={busy}
              />
            )}
          />
        )}
      </div>

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
          {busy
            ? uploads.uploading
              ? `Uploading ${String(Math.min(uploads.done + 1, uploads.total))} of ${String(uploads.total)}…`
              : "Saving…"
            : "Save"}
        </Button>
      </div>
    </form>
  );
}
