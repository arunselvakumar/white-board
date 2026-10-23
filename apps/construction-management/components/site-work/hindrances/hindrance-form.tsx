"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { Controller, useForm, useWatch, type FieldPath } from "react-hook-form";
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
import { PendingFilesField } from "@/components/site-work/documents/pending-files-field";
import { useUploadPendingFiles } from "@/components/site-work/documents/use-upload-pending-files";
import { localToday } from "@/components/procurement/inventory/inventory-format";
import { QueryHttpError } from "@/src/queries/http";
import {
  hindranceFormOptionsQuery,
  hindrancesPath,
  useCreateHindrance,
  useUpdateHindrance,
  type CreateHindranceInput,
  type Hindrance,
} from "@/src/queries/hindrances";
import {
  HINDRANCE_CAUSE_LABELS,
  HINDRANCE_CAUSES,
  HINDRANCE_LIMITS,
  isHindranceCause,
  RESPONSIBLE_PARTIES,
  RESPONSIBLE_PARTY_LABELS,
  type HindranceCause,
  type ResponsibleParty,
} from "@/src/site-work/domain/hindrance";
import { isCalendarDate } from "@/src/shared-kernel/calendar-date";
import type { LocationRef } from "@/src/shared-kernel/location-ref";
import { LocationPickerSkeleton } from "@/components/locations/locations-skeletons";

const NONE = "none";
const max = (n: number) =>
  z.string().max(n, `Use at most ${String(n)} characters.`);

const schema = z
  .object({
    startDate: z.string().min(1, "Choose the start date."),
    endDate: z.string(),
    hoursLost: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || /^\d{1,6}(\.\d{1,2})?$/.test(value),
        "Enter hours, with at most 2 decimals.",
      ),
    cause: z.string().min(1, "Choose the cause."),
    affectedActivity: max(HINDRANCE_LIMITS.affectedActivity)
      .trim()
      .min(1, "Enter the affected activity."),
    siteLocation: z.custom<LocationRef | null>(),
    responsibleParty: z.string().min(1, "Choose the responsible party."),
    contractorId: z.string(),
    description: max(HINDRANCE_LIMITS.description),
    equipmentUsageSheetId: z.string(),
    signOffUserId: z.string(),
    signOffPartyName: max(HINDRANCE_LIMITS.partyName),
    signOffPartyRole: max(HINDRANCE_LIMITS.partyRole),
    signedOn: z.string(),
    /** Picked on a new hindrance; uploaded once it is saved. */
    files: z.custom<File[]>(),
  })
  .superRefine((value, ctx) => {
    if (value.endDate !== "" && value.endDate < value.startDate)
      ctx.addIssue({
        code: "custom",
        message: "The end date cannot be before the start date.",
        path: ["endDate"],
      });
    if (value.responsibleParty === "contractor" && value.contractorId === "")
      ctx.addIssue({
        code: "custom",
        message: "Choose the Contractor responsible.",
        path: ["contractorId"],
      });
    const name = value.signOffPartyName.trim();
    const any =
      name !== "" ||
      value.signedOn !== "" ||
      value.signOffUserId !== "" ||
      value.signOffPartyRole.trim() !== "";
    if (any && name === "")
      ctx.addIssue({
        code: "custom",
        message: "Enter the other party's name, or clear the sign-off.",
        path: ["signOffPartyName"],
      });
    if (any && value.signedOn === "")
      ctx.addIssue({
        code: "custom",
        message: "Choose the date it was signed, or clear the sign-off.",
        path: ["signedOn"],
      });
    if (value.signedOn !== "" && value.signedOn < value.startDate)
      ctx.addIssue({
        code: "custom",
        message: "The sign-off cannot be before the start date.",
        path: ["signedOn"],
      });
  });
type Values = z.infer<typeof schema>;

/** Server codes and fields to the form's field names. */
const SERVER_FIELDS: Record<string, FieldPath<Values>> = {
  startDate: "startDate",
  endDate: "endDate",
  hoursLost: "hoursLost",
  cause: "cause",
  affectedActivity: "affectedActivity",
  siteLocation: "siteLocation",
  responsibleParty: "responsibleParty",
  contractorId: "contractorId",
  description: "description",
  "signOff.userId": "signOffUserId",
  "signOff.partyName": "signOffPartyName",
  "signOff.partyRole": "signOffPartyRole",
  "signOff.signedOn": "signedOn",
};

const DATE_CODES = new Set([
  "BACKDATED_CREATE_BLOCKED",
  "BACKDATED_EDIT_BLOCKED",
  "FINANCIAL_PERIOD_CLOSED",
]);

/** What a usage sheet's **Record hindrance** link prefills (`?cause=…`). */
export type HindrancePrefill = {
  cause?: string;
  date?: string;
  equipmentUsageSheetId?: string;
  activity?: string;
};

const orNull = (value: string): string | null =>
  value.trim() === "" ? null : value.trim();

function OptionSelect({
  id,
  value,
  onChange,
  items,
  placeholder,
  invalid,
  required,
  label,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  items: readonly { value: string; label: string }[];
  placeholder: string;
  invalid?: boolean;
  required?: boolean;
  label?: string;
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
      <SelectTrigger
        id={id}
        aria-label={label}
        className="w-full min-w-0"
        aria-required={required}
        aria-invalid={invalid}
      >
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

function defaults(
  hindrance: Hindrance | undefined,
  prefill: HindrancePrefill,
): Values {
  if (hindrance != null)
    return {
      startDate: hindrance.startDate,
      endDate: hindrance.endDate ?? "",
      hoursLost: hindrance.hoursLost ?? "",
      cause: hindrance.cause,
      affectedActivity: hindrance.affectedActivity,
      siteLocation: hindrance.siteLocation,
      responsibleParty: hindrance.responsibleParty,
      contractorId: hindrance.contractor?.id ?? "",
      description: hindrance.description ?? "",
      equipmentUsageSheetId: hindrance.equipmentUsageSheet?.id ?? "",
      signOffUserId: hindrance.signOff?.teamMember?.userId ?? "",
      signOffPartyName: hindrance.signOff?.partyName ?? "",
      signOffPartyRole: hindrance.signOff?.partyRole ?? "",
      signedOn: hindrance.signOff?.signedOn ?? "",
      files: [],
    };
  const date =
    prefill.date != null && isCalendarDate(prefill.date)
      ? prefill.date
      : localToday();
  return {
    startDate: date,
    endDate: "",
    hoursLost: "",
    cause:
      prefill.cause != null && isHindranceCause(prefill.cause)
        ? prefill.cause
        : "",
    affectedActivity: (prefill.activity ?? "").slice(
      0,
      HINDRANCE_LIMITS.affectedActivity,
    ),
    siteLocation: null,
    responsibleParty: "",
    contractorId: "",
    description: "",
    equipmentUsageSheetId: prefill.equipmentUsageSheetId ?? "",
    signOffUserId: "",
    signOffPartyName: "",
    signOffPartyRole: "",
    signedOn: "",
    files: [],
  };
}

/**
 * Record or edit a hindrance (CM-607, ADR CM-0016 §14): start and end
 * (empty while it continues), hours lost, cause, the affected activity and
 * location, the responsible party (with the Contractor when it is one),
 * a description, the joint sign-off as signed on site, and on a new
 * hindrance its files (PDF or image), uploaded once it is saved. A usage
 * sheet's **Record hindrance** link prefills it (`HindrancePrefill`).
 */
export function HindranceForm({
  projectId,
  hindrance,
  prefill = {},
}: {
  projectId: string;
  /** Edit this hindrance. */
  hindrance?: Hindrance;
  prefill?: HindrancePrefill;
}) {
  const router = useRouter();
  const { data: options } = useSuspenseQuery(
    hindranceFormOptionsQuery(projectId),
  );
  const create = useCreateHindrance();
  const update = useUpdateHindrance(hindrance?.id ?? "");
  const uploads = useUploadPendingFiles("hindrance");
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults(hindrance, prefill),
  });
  const errors = form.formState.errors;
  const party = useWatch({ control: form.control, name: "responsibleParty" });
  const sheetId = useWatch({
    control: form.control,
    name: "equipmentUsageSheetId",
  });
  const [signOffUserId, signOffPartyName, signOffPartyRole, signedOn] =
    useWatch({
      control: form.control,
      name: [
        "signOffUserId",
        "signOffPartyName",
        "signOffPartyRole",
        "signedOn",
      ],
    });
  // Any sign-off field filled makes the other party's name and the date
  // required, as the schema checks.
  const signingOff =
    signOffPartyName.trim() !== "" ||
    signedOn !== "" ||
    signOffUserId !== "" ||
    signOffPartyRole.trim() !== "";

  const contractors = options.contractors.map((c) => ({
    value: c.id,
    label: c.isActive ? c.name : `${c.name} (inactive)`,
  }));
  if (
    hindrance?.contractor != null &&
    !contractors.some((c) => c.value === hindrance.contractor?.id)
  )
    contractors.push({
      value: hindrance.contractor.id,
      label: hindrance.contractor.name ?? "A removed Contractor",
    });
  const members = [
    { value: NONE, label: "No one" },
    ...options.teamMembers.map((m) => ({
      value: m.userId,
      label: m.isOwner ? `${m.name} (Owner)` : m.name,
    })),
  ];
  const signer = hindrance?.signOff?.teamMember;
  if (signer != null && !members.some((m) => m.value === signer.userId))
    members.push({
      value: signer.userId,
      label: signer.name ?? "A former member",
    });

  const submit = async (input: Values) => {
    setError(null);
    const anySignOff =
      input.signOffPartyName.trim() !== "" || input.signedOn !== "";
    const body = {
      startDate: input.startDate,
      endDate: input.endDate === "" ? null : input.endDate,
      hoursLost: orNull(input.hoursLost),
      cause: input.cause as HindranceCause,
      affectedActivity: input.affectedActivity.trim(),
      siteLocation: input.siteLocation as CreateHindranceInput["siteLocation"],
      responsibleParty: input.responsibleParty as ResponsibleParty,
      contractorId:
        input.responsibleParty === "contractor" ? input.contractorId : null,
      description: orNull(input.description),
      equipmentUsageSheetId: orNull(input.equipmentUsageSheetId),
      signOff: anySignOff
        ? {
            userId: orNull(input.signOffUserId),
            partyName: input.signOffPartyName.trim(),
            partyRole: orNull(input.signOffPartyRole),
            signedOn: input.signedOn,
          }
        : null,
    };
    try {
      const saved =
        hindrance == null
          ? await create.mutateAsync({ ...body, projectId })
          : await update.mutateAsync({
              ...body,
              expectedUpdatedAt: hindrance.updatedAt,
            });
      // A file that does not go up is named on the hindrance's Files,
      // where it can be added again; the hindrance itself is saved.
      if (hindrance == null) await uploads.uploadAll(saved.id, input.files);
      router.push(hindrancesPath(projectId, saved.id));
    } catch (caught) {
      if (caught instanceof QueryHttpError) {
        if (DATE_CODES.has(caught.code)) {
          form.setError("startDate", { message: caught.message });
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

  const busy = form.formState.isSubmitting || uploads.uploading;

  return (
    <form
      noValidate
      aria-label={
        hindrance == null ? "New hindrance" : `Edit ${hindrance.number}`
      }
      className="w-full max-w-4xl space-y-6"
      onSubmit={(event) => {
        void form.handleSubmit(submit)(event);
      }}
    >
      {sheetId !== "" && (
        <p className="bg-muted/50 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <Wrench aria-hidden="true" className="size-4 shrink-0" />
          {hindrance?.equipmentUsageSheet != null
            ? `Raised from Equipment Usage sheet ${hindrance.equipmentUsageSheet.number}.`
            : "Raised from an Equipment Usage sheet."}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="hindrance-start" required>
            Start date
          </Label>
          <Input
            id="hindrance-start"
            type="date"
            max={localToday()}
            aria-required
            aria-invalid={errors.startDate != null}
            {...form.register("startDate")}
          />
          <FieldError message={errors.startDate?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hindrance-end">End date</Label>
          <Input
            id="hindrance-end"
            type="date"
            max={localToday()}
            aria-invalid={errors.endDate != null}
            aria-describedby="hindrance-end-hint"
            {...form.register("endDate")}
          />
          <p id="hindrance-end-hint" className="text-muted-foreground text-xs">
            Leave empty while it continues.
          </p>
          <FieldError message={errors.endDate?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hindrance-hours">Hours lost</Label>
          <Input
            id="hindrance-hours"
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={errors.hoursLost != null}
            {...form.register("hoursLost")}
          />
          <FieldError message={errors.hoursLost?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hindrance-cause" required>
            Cause
          </Label>
          <Controller
            control={form.control}
            name="cause"
            render={({ field }) => (
              <OptionSelect
                id="hindrance-cause"
                value={field.value}
                onChange={field.onChange}
                placeholder="Choose the cause"
                invalid={errors.cause != null}
                required
                items={HINDRANCE_CAUSES.map((value) => ({
                  value,
                  label: HINDRANCE_CAUSE_LABELS[value],
                }))}
              />
            )}
          />
          <FieldError message={errors.cause?.message} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="hindrance-activity" required>
            Affected activity
          </Label>
          <Input
            id="hindrance-activity"
            autoComplete="off"
            aria-required
            aria-invalid={errors.affectedActivity != null}
            {...form.register("affectedActivity")}
          />
          <FieldError message={errors.affectedActivity?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hindrance-party" required>
            Responsible party
          </Label>
          <Controller
            control={form.control}
            name="responsibleParty"
            render={({ field }) => (
              <OptionSelect
                id="hindrance-party"
                value={field.value}
                onChange={field.onChange}
                placeholder="Choose the party"
                invalid={errors.responsibleParty != null}
                required
                items={RESPONSIBLE_PARTIES.map((value) => ({
                  value,
                  label: RESPONSIBLE_PARTY_LABELS[value],
                }))}
              />
            )}
          />
          <FieldError message={errors.responsibleParty?.message} />
        </div>
        {party === "contractor" && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="hindrance-contractor" required>
              Contractor
            </Label>
            <Controller
              control={form.control}
              name="contractorId"
              render={({ field }) => (
                <OptionSelect
                  id="hindrance-contractor"
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={
                    contractors.length === 0
                      ? "No Contractors on this Project"
                      : "Choose a Contractor"
                  }
                  invalid={errors.contractorId != null}
                  required
                  items={contractors}
                />
              )}
            />
            <FieldError message={errors.contractorId?.message} />
          </div>
        )}
        <div className="space-y-1.5 sm:col-span-3">
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
        <div className="space-y-1.5 sm:col-span-3">
          <Label htmlFor="hindrance-description">Description</Label>
          <Textarea
            id="hindrance-description"
            rows={3}
            aria-invalid={errors.description != null}
            {...form.register("description")}
          />
          <FieldError message={errors.description?.message} />
        </div>
      </div>

      <fieldset className="space-y-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">Joint sign-off</legend>
        <p className="text-muted-foreground text-sm">
          Record who signed the hindrance on site. It is not an approval.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="hindrance-signer">For the Company</Label>
            <Controller
              control={form.control}
              name="signOffUserId"
              render={({ field }) => (
                <OptionSelect
                  id="hindrance-signer"
                  value={field.value === "" ? NONE : field.value}
                  onChange={field.onChange}
                  placeholder="No one"
                  invalid={errors.signOffUserId != null}
                  items={members}
                />
              )}
            />
            <FieldError message={errors.signOffUserId?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hindrance-signed-on" required={signingOff}>
              Signed on
            </Label>
            <Input
              id="hindrance-signed-on"
              type="date"
              max={localToday()}
              aria-required={signingOff}
              aria-invalid={errors.signedOn != null}
              {...form.register("signedOn")}
            />
            <FieldError message={errors.signedOn?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hindrance-party-name" required={signingOff}>
              Other party&apos;s name
            </Label>
            <Input
              id="hindrance-party-name"
              autoComplete="off"
              aria-required={signingOff}
              aria-invalid={errors.signOffPartyName != null}
              {...form.register("signOffPartyName")}
            />
            <FieldError message={errors.signOffPartyName?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hindrance-party-role">
              Other party&apos;s role
            </Label>
            <Input
              id="hindrance-party-role"
              autoComplete="off"
              aria-invalid={errors.signOffPartyRole != null}
              {...form.register("signOffPartyRole")}
            />
            <FieldError message={errors.signOffPartyRole?.message} />
          </div>
        </div>
      </fieldset>

      {hindrance == null && (
        <Controller
          control={form.control}
          name="files"
          render={({ field }) => (
            <PendingFilesField
              documentType="hindrance"
              value={field.value}
              onChange={field.onChange}
              disabled={busy}
            />
          )}
        />
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
