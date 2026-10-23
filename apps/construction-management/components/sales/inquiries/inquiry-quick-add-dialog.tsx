"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, type FieldPath } from "react-hook-form";
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
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { SalesPendingFilesField } from "@/components/sales/documents/sales-pending-files-field";
import { useUploadPendingSalesFiles } from "@/components/sales/documents/use-upload-pending-sales-files";
import { QueryHttpError } from "@/src/queries/http";
import {
  duplicateMatches,
  inquiryFormOptionsQuery,
  useCreateInquiry,
  type InquiryDetail,
  type InquiryDuplicateMatch,
  inquiriesPath,
} from "@/src/queries/sales-inquiries";
import {
  INTEREST_TYPE_LABELS,
  INTEREST_TYPES,
  SALES_LIMITS,
  type InterestType,
} from "@/src/sales/domain/sales-terms";

import { InquiryDuplicatePrompt } from "./inquiry-duplicate-prompt";
import { InquirySelect } from "./inquiry-select";
import { withUploadFailed } from "@/components/sales/documents/upload-failed";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the name.")
    .max(
      SALES_LIMITS.name,
      `Use at most ${String(SALES_LIMITS.name)} characters.`,
    ),
  mobile: z.string().max(40),
  interestType: z.string(),
  interestedWingId: z.string(),
  interestedUnitType: z
    .string()
    .max(
      SALES_LIMITS.unitType,
      `Use at most ${String(SALES_LIMITS.unitType)} characters.`,
    ),
  remarks: z
    .string()
    .max(
      SALES_LIMITS.remarks,
      `Use at most ${String(SALES_LIMITS.remarks)} characters.`,
    ),
  visitingCard: z.custom<File[]>(),
});
type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, FieldPath<Values>> = {
  name: "name",
  mobile: "mobile",
  interestType: "interestType",
  interestedWingId: "interestedWingId",
  interestedUnitType: "interestedUnitType",
  remarks: "remarks",
};

const EMPTY: Values = {
  name: "",
  mobile: "",
  interestType: "",
  interestedWingId: "",
  interestedUnitType: "",
  remarks: "",
  visitingCard: [],
};

/**
 * **Quick add** (CM-1003, ADR CM-0022 §3): the same save as the full form
 * with fewer fields — Name, Mobile, Interest Type, Interested In,
 * Remarks and a Visiting Card photo. Dated today, at the first stage, the
 * viewer as Assignee and Lead Owner. A duplicate opens the prompt with
 * **Save anyway**.
 */
export function InquiryQuickAddDialog({
  projectId,
  open,
  onOpenChange,
  onCreated,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (inquiry: InquiryDetail) => void;
}) {
  const { data: options } = useSuspenseQuery(
    inquiryFormOptionsQuery(projectId),
  );
  const router = useRouter();
  const create = useCreateInquiry();
  const uploads = useUploadPendingSalesFiles("inquiry");
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<InquiryDuplicateMatch[] | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });
  const errors = form.formState.errors;

  const close = () => {
    form.reset(EMPTY);
    setError(null);
    setMatches(null);
    onOpenChange(false);
  };

  const save = (allowDuplicate: boolean) =>
    form.handleSubmit(async (input) => {
      setError(null);
      const orNull = (value: string) =>
        value.trim() === "" ? null : value.trim();
      try {
        const saved = await create.mutateAsync({
          projectId,
          name: input.name.trim(),
          mobile: orNull(input.mobile),
          interestType: orNull(input.interestType) as InterestType | null,
          interestedWingId: orNull(input.interestedWingId),
          interestedUnitType: orNull(input.interestedUnitType),
          remarks: orNull(input.remarks),
          allowDuplicate,
        });
        const { failed } = await uploads.uploadAll(saved.id, [
          { role: "visiting_card", files: input.visitingCard },
        ]);
        onCreated?.(saved);
        close();
        // The card can be added again on the inquiry's page, which names it.
        if (failed.length > 0)
          router.push(
            withUploadFailed(inquiriesPath(projectId, saved.id), failed),
          );
      } catch (caught) {
        const duplicates = duplicateMatches(caught);
        if (duplicates != null) {
          setMatches(duplicates);
          return;
        }
        setMatches(null);
        if (caught instanceof QueryHttpError) {
          const raw = (caught.details as { field?: unknown } | undefined)
            ?.field;
          const field =
            typeof raw === "string" ? SERVER_FIELDS[raw] : undefined;
          if (field != null) form.setError(field, { message: caught.message });
          else setError(caught.message);
          return;
        }
        setError("Something went wrong. Please try again.");
      }
    });

  const busy = form.formState.isSubmitting || uploads.uploading;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="max-h-[90dvh] grid-cols-1 overflow-y-auto sm:max-w-lg">
        <form
          noValidate
          aria-label="Quick add"
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(event) => {
            void save(false)(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>Quick add</DialogTitle>
            <DialogDescription>
              A lead in a few taps. Add the rest on its page later.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="quick-name" required>
                Name
              </Label>
              <Input
                id="quick-name"
                autoComplete="off"
                aria-required
                aria-invalid={errors.name != null}
                {...form.register("name")}
              />
              <FieldError message={errors.name?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-mobile">Mobile</Label>
              <Input
                id="quick-mobile"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="98450 12345"
                aria-invalid={errors.mobile != null}
                {...form.register("mobile")}
              />
              <FieldError message={errors.mobile?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-interest">Interest Type</Label>
              <Controller
                control={form.control}
                name="interestType"
                render={({ field }) => (
                  <InquirySelect
                    id="quick-interest"
                    value={field.value}
                    onChange={field.onChange}
                    noneLabel="Not known"
                    items={INTEREST_TYPES.map((key) => ({
                      value: key,
                      label: INTEREST_TYPE_LABELS[key],
                    }))}
                  />
                )}
              />
            </div>
            {options.wings.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="quick-wing">Interested In (Wing)</Label>
                <Controller
                  control={form.control}
                  name="interestedWingId"
                  render={({ field }) => (
                    <InquirySelect
                      id="quick-wing"
                      value={field.value}
                      onChange={field.onChange}
                      noneLabel="Any Wing"
                      items={options.wings.map((wing) => ({
                        value: wing.id,
                        label: wing.name,
                      }))}
                    />
                  )}
                />
                <FieldError message={errors.interestedWingId?.message} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="quick-unit-type">Unit type</Label>
              <Input
                id="quick-unit-type"
                autoComplete="off"
                placeholder="2BHK"
                aria-invalid={errors.interestedUnitType != null}
                {...form.register("interestedUnitType")}
              />
              <FieldError message={errors.interestedUnitType?.message} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="quick-remarks">Remarks</Label>
              <Textarea
                id="quick-remarks"
                rows={2}
                aria-invalid={errors.remarks != null}
                {...form.register("remarks")}
              />
              <FieldError message={errors.remarks?.message} />
            </div>
            <div className="sm:col-span-2">
              <Controller
                control={form.control}
                name="visitingCard"
                render={({ field }) => (
                  <SalesPendingFilesField
                    documentType="inquiry"
                    role="visiting_card"
                    label="Visiting Card"
                    value={field.value}
                    onChange={field.onChange}
                    disabled={busy}
                  />
                )}
              />
            </div>
          </div>
          <FormAlert message={error ?? undefined} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
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
      </DialogContent>
    </Dialog>
  );
}
