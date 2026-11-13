"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { VISIT_TARGET_MAX } from "@/src/marketing/domain/team";
import {
  teamErrorMessage,
  useSetVisitTarget,
  type MarketingTeamPerson,
} from "@/src/queries/marketing-team";

import { monthWords } from "../../visits/_components/visit-parts";

const OUT_OF_RANGE = `Enter a whole number of Visits from 0 to ${String(VISIT_TARGET_MAX)}, or leave it empty.`;

const schema = z.object({
  target: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === "" ||
        (/^\d+$/.test(value) && Number(value) <= VISIT_TARGET_MAX),
      OUT_OF_RANGE,
    ),
});
type Values = z.infer<typeof schema>;

/**
 * A Marketing Person's monthly Visit target: a whole number, or empty for
 * none. It applies from this month; earlier months keep theirs.
 */
export function VisitTargetDialog({
  person,
  month,
  open,
  onOpenChange,
}: {
  person: MarketingTeamPerson;
  /** `YYYY-MM`, the Company's current month. */
  month: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useSetVisitTarget(person.memberId);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      target: person.target == null ? "" : String(person.target),
    },
  });
  const errors = form.formState.errors;

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await save.mutateAsync(
        values.target === "" ? null : Number(values.target),
      );
      onOpenChange(false);
    } catch (caught) {
      setError(teamErrorMessage(caught));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-cols-1 sm:max-w-sm">
        <form
          noValidate
          aria-label="Set target"
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle className="break-words">{`Visit target for ${person.name}`}</DialogTitle>
            <DialogDescription>
              {`Completed Visits a month. It applies from ${monthWords(month)} on; earlier months keep theirs. Leave it empty for no target.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="visit-target">Visits a month</Label>
            <Input
              id="visit-target"
              inputMode="numeric"
              autoComplete="off"
              className="w-32"
              aria-invalid={errors.target != null}
              {...form.register("target")}
            />
            <FieldError message={errors.target?.message} />
          </div>
          <FormAlert message={error ?? undefined} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
