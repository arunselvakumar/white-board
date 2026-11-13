"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm, useWatch, type FieldPath } from "react-hook-form";
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
import { Label } from "@repo/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/radio-group";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import {
  LOST_REASON_LABELS,
  LOST_REASONS,
  MANUAL_STAGES,
  MARKETING_LIMITS,
  STAGE_LABELS,
  type LostReason,
  type ManualStage,
} from "@/src/marketing/domain/marketing-terms";
import {
  companyErrorMessage,
  errorField,
  useMoveCompanyStage,
  type ProspectCompany,
} from "@/src/queries/marketing-companies";

import { CompanySelect } from "./company-parts";

const schema = z
  .object({
    stage: z.string().min(1, "Choose a Stage."),
    lostReason: z.string(),
    lostReasonText: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.stage !== "lost") return;
    if (value.lostReason === "") {
      ctx.addIssue({
        code: "custom",
        message: "Choose why the company was lost.",
        path: ["lostReason"],
      });
      return;
    }
    // The words are only sent, and shown, for Other.
    if (value.lostReason !== "other") return;
    const words = value.lostReasonText.trim();
    if (words === "")
      ctx.addIssue({
        code: "custom",
        message: "Say why the company was lost.",
        path: ["lostReasonText"],
      });
    else if (words.length > MARKETING_LIMITS.lostReasonText)
      ctx.addIssue({
        code: "custom",
        message: `Keep the reason to ${String(MARKETING_LIMITS.lostReasonText)} characters.`,
        path: ["lostReasonText"],
      });
  });
type Values = z.infer<typeof schema>;

const FIELDS = new Set<string>(["stage", "lostReason", "lostReasonText"]);

const REASON_ITEMS = LOST_REASONS.map((reason) => ({
  value: reason,
  label: LOST_REASON_LABELS[reason],
}));

const FRESH: Values = { stage: "", lostReason: "", lostReasonText: "" };

const ERROR_IDS = {
  stage: "move-stage-stage-error",
  lostReason: "move-stage-lost-reason-error",
  lostReasonText: "move-stage-lost-text-error",
} as const;

/**
 * Moves a Prospect Company to a later Stage by hand (ADR CM-0040 §11):
 * Requirement received, Quotation sent, Negotiation, Won or Lost, in any
 * order; the current one is not offered, except Lost, to change the Lost
 * Reason. Lost needs a Lost Reason, and Other needs words. While a move
 * is saving the dialog stays open, so its answer lands on this opening.
 */
export function MoveStageDialog({
  company,
  open,
  onOpenChange,
}: {
  company: ProspectCompany;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const move = useMoveCompanyStage(company.id);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: FRESH,
  });
  const errors = form.formState.errors;
  const pending = form.formState.isSubmitting;
  const stage = useWatch({ control: form.control, name: "stage" });
  const reason = useWatch({ control: form.control, name: "lostReason" });
  const describedBy = (field: keyof typeof ERROR_IDS) =>
    errors[field] == null ? undefined : ERROR_IDS[field];

  const dismiss = () => {
    form.reset(FRESH);
    setError(null);
    onOpenChange(false);
  };

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    const lost = values.stage === "lost";
    const words = values.lostReasonText.trim();
    try {
      await move.mutateAsync({
        stage: values.stage as ManualStage,
        lostReason: lost ? (values.lostReason as LostReason) : null,
        lostReasonText:
          lost && values.lostReason === "other" && words !== "" ? words : null,
        expectedUpdatedAt: company.updatedAt,
      });
      dismiss();
    } catch (caught) {
      const field = errorField(caught);
      if (field != null && FIELDS.has(field)) {
        form.setError(field as FieldPath<Values>, {
          message: companyErrorMessage(caught),
        });
        return;
      }
      setError(companyErrorMessage(caught));
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else if (!pending) dismiss();
      }}
    >
      <DialogContent className="max-h-[90dvh] grid-cols-1 overflow-y-auto sm:max-w-md">
        <form
          noValidate
          aria-label="Move Stage"
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle className="break-words">Move Stage</DialogTitle>
            <DialogDescription>
              {`${company.name} is at ${STAGE_LABELS[company.stage]}. Every move is kept in its history.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Controller
              control={form.control}
              name="stage"
              render={({ field }) => (
                <RadioGroup
                  aria-label="Stage"
                  aria-required
                  aria-invalid={errors.stage != null}
                  aria-describedby={describedBy("stage")}
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value);
                  }}
                  className="grid gap-2"
                >
                  {MANUAL_STAGES.map((value) => (
                    <div
                      key={value}
                      className="bg-card flex items-center gap-2 rounded-lg border px-3 py-2"
                    >
                      <RadioGroupItem
                        id={`move-stage-${value}`}
                        value={value}
                        disabled={value === company.stage && value !== "lost"}
                      />
                      <Label
                        htmlFor={`move-stage-${value}`}
                        className="font-normal"
                      >
                        {STAGE_LABELS[value]}
                        {value === company.stage ? " (now)" : ""}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              )}
            />
            <FieldError id={ERROR_IDS.stage} message={errors.stage?.message} />
          </div>
          {stage === "lost" && (
            <div className="space-y-1.5">
              <Label htmlFor="move-stage-lost-reason" required>
                Lost Reason
              </Label>
              <Controller
                control={form.control}
                name="lostReason"
                render={({ field }) => (
                  <CompanySelect
                    required
                    id="move-stage-lost-reason"
                    value={field.value}
                    onChange={field.onChange}
                    invalid={errors.lostReason != null}
                    describedBy={describedBy("lostReason")}
                    items={REASON_ITEMS}
                    placeholder="Choose a reason"
                  />
                )}
              />
              <FieldError
                id={ERROR_IDS.lostReason}
                message={errors.lostReason?.message}
              />
            </div>
          )}
          {stage === "lost" && reason === "other" && (
            <div className="space-y-1.5">
              <Label htmlFor="move-stage-lost-text" required>
                Why was it lost?
              </Label>
              <Textarea
                id="move-stage-lost-text"
                rows={2}
                aria-required
                aria-invalid={errors.lostReasonText != null}
                aria-describedby={describedBy("lostReasonText")}
                {...form.register("lostReasonText")}
              />
              <FieldError
                id={ERROR_IDS.lostReasonText}
                message={errors.lostReasonText?.message}
              />
            </div>
          )}
          <FormAlert message={error ?? undefined} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={dismiss}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Move"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
