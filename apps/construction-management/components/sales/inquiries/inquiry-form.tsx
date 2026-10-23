"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Controller, useForm, type FieldPath } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { localToday } from "@/components/payments/payment-format";
import { SalesPendingFilesField } from "@/components/sales/documents/sales-pending-files-field";
import { useUploadPendingSalesFiles } from "@/components/sales/documents/use-upload-pending-sales-files";
import { QueryHttpError } from "@/src/queries/http";
import {
  duplicateMatches,
  inquiriesPath,
  inquiryFormOptionsQuery,
  useCreateInquiry,
  useUpdateInquiry,
  type CreateInquiryInput,
  type InquiryDetail,
  type InquiryDuplicateMatch,
} from "@/src/queries/sales-inquiries";
import {
  INTEREST_TYPE_LABELS,
  INTEREST_TYPES,
  SALES_LIMITS,
  type InterestType,
} from "@/src/sales/domain/sales-terms";

import { InquiryDuplicatePrompt } from "./inquiry-duplicate-prompt";
import { InquirySelect, withCurrentOption } from "./inquiry-select";
import { withUploadFailed } from "@/components/sales/documents/upload-failed";

const max = (limit: number, words: string) =>
  z
    .string()
    .max(limit, `Use at most ${String(limit)} characters for the ${words}.`);

const schema = z.object({
  inquiryDate: z.string().min(1, "Choose the Inquiry Date."),
  name: z
    .string()
    .trim()
    .min(1, "Enter the name.")
    .max(
      SALES_LIMITS.name,
      `Use at most ${String(SALES_LIMITS.name)} characters.`,
    ),
  mobile: z.string().max(40),
  email: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value),
      "Enter a valid email address.",
    ),
  address: max(SALES_LIMITS.address, "address"),
  occupation: max(SALES_LIMITS.occupation, "occupation"),
  interestType: z.string(),
  interestedWingId: z.string(),
  interestedUnitType: max(SALES_LIMITS.unitType, "unit type"),
  leadSourceId: z.string(),
  funnelStageId: z.string(),
  nextFollowUpDate: z.string(),
  nextFollowUpTime: z.string(),
  assigneeMemberId: z.string(),
  leadOwnerMemberId: z.string(),
  remarks: max(SALES_LIMITS.remarks, "remarks"),
  visitingCard: z.custom<File[]>(),
  photos: z.custom<File[]>(),
});
type Values = z.infer<typeof schema>;

/** The fields `schema` rejects when empty: their labels show the asterisk. */
const REQUIRED_FIELDS = new Set<keyof Values>(["inquiryDate", "name"]);

/** Server fields (`details.field`) to the form's. */
const SERVER_FIELDS: Record<string, FieldPath<Values>> = {
  inquiryDate: "inquiryDate",
  name: "name",
  mobile: "mobile",
  email: "email",
  address: "address",
  occupation: "occupation",
  interestType: "interestType",
  interestedWingId: "interestedWingId",
  interestedUnitType: "interestedUnitType",
  leadSourceId: "leadSourceId",
  funnelStageId: "funnelStageId",
  nextFollowUp: "nextFollowUpDate",
  assigneeMemberId: "assigneeMemberId",
  leadOwnerMemberId: "leadOwnerMemberId",
  remarks: "remarks",
};

/** Back-dated entry refusals are about the Inquiry Date. */
const DATE_CODES = new Set([
  "BACKDATED_CREATE_BLOCKED",
  "BACKDATED_EDIT_BLOCKED",
  "FINANCIAL_PERIOD_CLOSED",
]);

function defaults(
  inquiry: InquiryDetail | undefined,
  viewerMemberId: string | null,
  firstStageId: string,
): Values {
  return {
    inquiryDate: inquiry?.inquiryDate ?? localToday(),
    name: inquiry?.name ?? "",
    mobile: inquiry?.mobile ?? "",
    email: inquiry?.email ?? "",
    address: inquiry?.address ?? "",
    occupation: inquiry?.occupation ?? "",
    interestType: inquiry?.interestType ?? "",
    interestedWingId: inquiry?.interestedWing?.id ?? "",
    interestedUnitType: inquiry?.interestedUnitType ?? "",
    leadSourceId: inquiry?.leadSource?.id ?? "",
    funnelStageId: inquiry?.funnelStage?.id ?? firstStageId,
    nextFollowUpDate: inquiry?.nextFollowUp?.date ?? "",
    nextFollowUpTime: inquiry?.nextFollowUp?.time ?? "",
    assigneeMemberId:
      inquiry == null ? (viewerMemberId ?? "") : (inquiry.assignee?.id ?? ""),
    leadOwnerMemberId:
      inquiry == null ? (viewerMemberId ?? "") : (inquiry.leadOwner?.id ?? ""),
    remarks: inquiry?.remarks ?? "",
    visitingCard: [],
    photos: [],
  };
}

/**
 * Add or edit an inquiry with the full form (CM-1003, ADR CM-0022 §3):
 * Inquiry Date (not in the future; back-dated window), Name, Mobile,
 * Email, Address, Occupation, Interest Type, Interested In (a Wing and a
 * unit type), Lead Source, Funnel Stage (the first unless picked), Next
 * follow-up (date and optional time), Assignee and Lead Owner (the
 * viewer by default), Remarks; on a new inquiry its Visiting Card and
 * photos, uploaded once it is saved. A duplicate mobile or email opens
 * the duplicate prompt with **Save anyway**.
 */
export function InquiryForm({
  projectId,
  inquiry,
}: {
  projectId: string;
  /** Edit this inquiry. */
  inquiry?: InquiryDetail;
}) {
  const router = useRouter();
  const { data: options } = useSuspenseQuery(
    inquiryFormOptionsQuery(projectId),
  );
  const create = useCreateInquiry();
  const update = useUpdateInquiry(inquiry?.id ?? "");
  const uploads = useUploadPendingSalesFiles("inquiry");
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [matches, setMatches] = useState<InquiryDuplicateMatch[] | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults(
      inquiry,
      options.viewerMemberId,
      options.funnelStages[0]?.id ?? "",
    ),
  });
  const errors = form.formState.errors;
  const open = inquiry == null || inquiry.status === "open";

  const members = (current: { id: string; name: string | null } | null) =>
    withCurrentOption(
      options.members.map((member) => ({
        value: member.id,
        label: member.isOwner ? `${member.name} (Owner)` : member.name,
      })),
      current,
      "not on this Project",
    );
  const sources = withCurrentOption(
    options.leadSources.map((item) => ({ value: item.id, label: item.name })),
    inquiry?.leadSource,
    "disabled",
  );
  const stages = withCurrentOption(
    options.funnelStages.map((item) => ({ value: item.id, label: item.name })),
    inquiry?.funnelStage,
    "deleted",
  );
  const wings = withCurrentOption(
    options.wings.map((item) => ({ value: item.id, label: item.name })),
    inquiry?.interestedWing,
    "removed",
  );

  const save = (allowDuplicate: boolean) =>
    form.handleSubmit(async (input) => {
      setError(null);
      const orNull = (value: string) =>
        value.trim() === "" ? null : value.trim();
      const body = {
        inquiryDate: input.inquiryDate,
        name: input.name.trim(),
        mobile: orNull(input.mobile),
        email: orNull(input.email),
        address: orNull(input.address),
        occupation: orNull(input.occupation),
        interestType: orNull(input.interestType) as InterestType | null,
        interestedWingId: orNull(input.interestedWingId),
        interestedUnitType: orNull(input.interestedUnitType),
        leadSourceId: orNull(input.leadSourceId),
        funnelStageId: orNull(input.funnelStageId),
        nextFollowUpDate: orNull(input.nextFollowUpDate),
        nextFollowUpTime:
          orNull(input.nextFollowUpDate) == null
            ? null
            : orNull(input.nextFollowUpTime),
        assigneeMemberId: orNull(input.assigneeMemberId),
        leadOwnerMemberId: orNull(input.leadOwnerMemberId),
        remarks: orNull(input.remarks),
        allowDuplicate,
      } satisfies Omit<CreateInquiryInput, "projectId">;
      try {
        const saved =
          inquiry == null
            ? await create.mutateAsync({ ...body, projectId })
            : await update.mutateAsync({
                ...body,
                expectedUpdatedAt: inquiry.updatedAt,
              });
        setMatches(null);
        setLeaving(true);
        // A file that does not go up can be added again on the inquiry's page.
        const { failed } =
          inquiry == null
            ? await uploads.uploadAll(saved.id, [
                { role: "visiting_card", files: input.visitingCard },
                { role: "photo", files: input.photos },
              ])
            : { failed: [] };
        router.push(
          withUploadFailed(inquiriesPath(projectId, saved.id), failed),
        );
      } catch (caught) {
        setLeaving(false);
        const duplicates = duplicateMatches(caught);
        if (duplicates != null) {
          setMatches(duplicates);
          return;
        }
        setMatches(null);
        if (caught instanceof QueryHttpError) {
          if (DATE_CODES.has(caught.code)) {
            form.setError("inquiryDate", { message: caught.message });
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
  type TextField = Exclude<keyof Values, "visitingCard" | "photos">;
  const field = (
    name: TextField,
    label: string,
    control: ReactNode,
    className?: string,
  ) => (
    <div
      className={className == null ? "space-y-1.5" : `space-y-1.5 ${className}`}
    >
      <Label htmlFor={`inquiry-${name}`} required={REQUIRED_FIELDS.has(name)}>
        {label}
      </Label>
      {control}
      <FieldError message={errors[name]?.message} />
    </div>
  );

  return (
    <form
      noValidate
      aria-label={inquiry == null ? "New inquiry" : `Edit ${inquiry.name}`}
      className="w-full max-w-4xl space-y-6"
      onSubmit={(event) => {
        void save(false)(event);
      }}
    >
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {field(
          "inquiryDate",
          "Inquiry Date",
          <Input
            id="inquiry-inquiryDate"
            type="date"
            max={localToday()}
            aria-required
            aria-invalid={errors.inquiryDate != null}
            {...form.register("inquiryDate")}
          />,
        )}
        {field(
          "name",
          "Name",
          <Input
            id="inquiry-name"
            autoComplete="off"
            aria-required
            aria-invalid={errors.name != null}
            {...form.register("name")}
          />,
        )}
        {field(
          "mobile",
          "Mobile",
          <Input
            id="inquiry-mobile"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="98450 12345"
            aria-invalid={errors.mobile != null}
            {...form.register("mobile")}
          />,
        )}
        {field(
          "email",
          "Email",
          <Input
            id="inquiry-email"
            type="email"
            autoComplete="off"
            aria-invalid={errors.email != null}
            {...form.register("email")}
          />,
        )}
        {field(
          "occupation",
          "Occupation",
          <Input
            id="inquiry-occupation"
            autoComplete="off"
            aria-invalid={errors.occupation != null}
            {...form.register("occupation")}
          />,
        )}
        {field(
          "interestType",
          "Interest Type",
          <Controller
            control={form.control}
            name="interestType"
            render={({ field: control }) => (
              <InquirySelect
                id="inquiry-interestType"
                value={control.value}
                onChange={control.onChange}
                noneLabel="Not known"
                invalid={errors.interestType != null}
                items={INTEREST_TYPES.map((key) => ({
                  value: key,
                  label: INTEREST_TYPE_LABELS[key],
                }))}
              />
            )}
          />,
        )}
        {wings.length > 0 &&
          field(
            "interestedWingId",
            "Interested In (Wing)",
            <Controller
              control={form.control}
              name="interestedWingId"
              render={({ field: control }) => (
                <InquirySelect
                  id="inquiry-interestedWingId"
                  value={control.value}
                  onChange={control.onChange}
                  noneLabel="Any Wing"
                  invalid={errors.interestedWingId != null}
                  items={wings}
                />
              )}
            />,
          )}
        {field(
          "interestedUnitType",
          "Unit type",
          <Input
            id="inquiry-interestedUnitType"
            autoComplete="off"
            placeholder="2BHK"
            aria-invalid={errors.interestedUnitType != null}
            {...form.register("interestedUnitType")}
          />,
        )}
        {field(
          "leadSourceId",
          "Lead Source",
          <Controller
            control={form.control}
            name="leadSourceId"
            render={({ field: control }) => (
              <InquirySelect
                id="inquiry-leadSourceId"
                value={control.value}
                onChange={control.onChange}
                noneLabel="Not known"
                invalid={errors.leadSourceId != null}
                items={sources}
              />
            )}
          />,
        )}
        {field(
          "funnelStageId",
          "Funnel Stage",
          <Controller
            control={form.control}
            name="funnelStageId"
            render={({ field: control }) => (
              <InquirySelect
                id="inquiry-funnelStageId"
                value={control.value}
                onChange={control.onChange}
                invalid={errors.funnelStageId != null}
                disabled={!open}
                items={stages}
              />
            )}
          />,
        )}
        {field(
          "assigneeMemberId",
          "Assignee",
          <Controller
            control={form.control}
            name="assigneeMemberId"
            render={({ field: control }) => (
              <InquirySelect
                id="inquiry-assigneeMemberId"
                value={control.value}
                onChange={control.onChange}
                noneLabel="No one"
                invalid={errors.assigneeMemberId != null}
                items={members(inquiry?.assignee ?? null)}
              />
            )}
          />,
        )}
        {field(
          "leadOwnerMemberId",
          "Lead Owner",
          <Controller
            control={form.control}
            name="leadOwnerMemberId"
            render={({ field: control }) => (
              <InquirySelect
                id="inquiry-leadOwnerMemberId"
                value={control.value}
                onChange={control.onChange}
                noneLabel="No one"
                invalid={errors.leadOwnerMemberId != null}
                items={members(inquiry?.leadOwner ?? null)}
              />
            )}
          />,
        )}
        <fieldset className="min-w-0 space-y-1.5 sm:col-span-2 lg:col-span-1">
          <legend className="text-sm leading-none font-medium">
            Next follow-up
          </legend>
          <div className="mt-1.5 grid grid-cols-[1fr_7rem] gap-2">
            <Input
              id="inquiry-nextFollowUpDate"
              type="date"
              aria-label="Next follow-up date"
              aria-invalid={errors.nextFollowUpDate != null}
              {...form.register("nextFollowUpDate")}
            />
            <Input
              id="inquiry-nextFollowUpTime"
              type="time"
              aria-label="Next follow-up time"
              {...form.register("nextFollowUpTime")}
            />
          </div>
          <FieldError message={errors.nextFollowUpDate?.message} />
        </fieldset>
        {field(
          "address",
          "Address",
          <Textarea
            id="inquiry-address"
            rows={2}
            aria-invalid={errors.address != null}
            {...form.register("address")}
          />,
          "sm:col-span-2 lg:col-span-3",
        )}
        {field(
          "remarks",
          "Remarks",
          <Textarea
            id="inquiry-remarks"
            rows={3}
            aria-invalid={errors.remarks != null}
            {...form.register("remarks")}
          />,
          "sm:col-span-2 lg:col-span-3",
        )}
      </div>

      {inquiry == null ? (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <Controller
            control={form.control}
            name="visitingCard"
            render={({ field: control }) => (
              <SalesPendingFilesField
                documentType="inquiry"
                role="visiting_card"
                label="Visiting Card"
                value={control.value}
                onChange={control.onChange}
                disabled={busy}
              />
            )}
          />
          <Controller
            control={form.control}
            name="photos"
            render={({ field: control }) => (
              <SalesPendingFilesField
                documentType="inquiry"
                role="photo"
                label="Photos"
                value={control.value}
                onChange={control.onChange}
                disabled={busy}
              />
            )}
          />
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Add or remove the Visiting Card and photos on the inquiry&apos;s page.
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
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
      <InquiryDuplicatePrompt
        projectId={projectId}
        matches={matches}
        pending={busy}
        onClose={() => {
          setMatches(null);
        }}
        onSaveAnyway={() => {
          void save(true)();
        }}
      />
    </form>
  );
}
