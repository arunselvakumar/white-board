"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useMemo, useState } from "react";
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
import {
  FOLLOW_UP_LIMITS,
  FOLLOW_UP_TYPE_LABELS,
  FOLLOW_UP_TYPES,
  type FollowUpType,
} from "@/src/marketing/domain/marketing-terms";
import { errorField } from "@/src/queries/marketing-companies";
import {
  followUpErrorMessage,
  followUpFormOptionsQuery,
  useCreateFollowUp,
  useDeleteFollowUp,
  useUpdateFollowUp,
  type FollowUp,
} from "@/src/queries/marketing-follow-ups";

import { CompanySelect } from "../../companies/_components/company-parts";
import { ProspectCompanyPicker } from "../../visits/_components/prospect-company-picker";

export const FOLLOW_UP_TYPE_ITEMS = FOLLOW_UP_TYPES.map((key) => ({
  value: key,
  label: FOLLOW_UP_TYPE_LABELS[key],
}));

const schema = z.object({
  prospectCompanyId: z.string().min(1, "Choose the Prospect Company."),
  type: z.string().min(1, "Choose the type."),
  dueDate: z.string().min(1, "Choose the date it is due."),
  ownerMemberId: z.string(),
  note: z
    .string()
    .max(
      FOLLOW_UP_LIMITS.note,
      `Keep the note to ${String(FOLLOW_UP_LIMITS.note)} characters.`,
    ),
});
type Values = z.infer<typeof schema>;

const FIELDS: Record<string, FieldPath<Values>> = {
  prospectCompanyId: "prospectCompanyId",
  type: "type",
  dueDate: "dueDate",
  ownerMemberId: "ownerMemberId",
  note: "note",
};

/** What a new Follow-up starts with: its company, and the Visit it came from. */
export type FollowUpPrefill = {
  company: { id: string; name: string };
  visit?: { id: string; number: string };
};

/**
 * Add a Follow-up (a company is picked, or given by the page it is added
 * from) or edit an Open one: type, due date, owner and note. Edit can
 * also delete it, after asking.
 */
export function FollowUpDialog({
  open,
  onOpenChange,
  followUp,
  prefill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this one; add a new one when left out. */
  followUp?: FollowUp;
  prefill?: FollowUpPrefill;
}) {
  const title = followUp == null ? "Add Follow-up" : "Edit Follow-up";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] grid-cols-1 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {followUp == null
              ? "Something owed to a Prospect Company: a call, a return Visit, an email or a quotation, with who owes it and when."
              : "Change the type, due date, owner or note. A new due date sends its reminders again."}
          </DialogDescription>
        </DialogHeader>
        <Suspense
          fallback={<p className="text-muted-foreground text-sm">Loading…</p>}
        >
          <FollowUpForm
            title={title}
            followUp={followUp}
            prefill={prefill}
            onDone={() => {
              onOpenChange(false);
            }}
          />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}

function FollowUpForm({
  title,
  followUp,
  prefill,
  onDone,
}: {
  title: string;
  followUp?: FollowUp;
  prefill?: FollowUpPrefill;
  onDone: () => void;
}) {
  const { data: options } = useSuspenseQuery(followUpFormOptionsQuery);
  const create = useCreateFollowUp();
  const update = useUpdateFollowUp(followUp?.id ?? "");
  const remove = useDeleteFollowUp(followUp?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fixed = followUp?.prospectCompany ?? prefill?.company ?? null;
  const visit = followUp?.visit ?? prefill?.visit ?? null;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues:
      followUp == null
        ? {
            prospectCompanyId: prefill?.company.id ?? "",
            type: "",
            dueDate: "",
            ownerMemberId: options.selfMemberId ?? "",
            note: "",
          }
        : {
            prospectCompanyId: followUp.prospectCompany.id,
            type: followUp.type,
            dueDate: followUp.dueDate,
            ownerMemberId: followUp.owner.id,
            note: followUp.note ?? "",
          },
  });
  const errors = form.formState.errors;

  // Active people; an owner who has since left stays pickable on Edit.
  const people = useMemo(() => {
    const list = options.people
      .filter((person) => person.active)
      .map((person) => ({ value: person.id, label: person.name }));
    if (followUp != null && !list.some((p) => p.value === followUp.owner.id))
      list.push({ value: followUp.owner.id, label: followUp.owner.name });
    return list;
  }, [options.people, followUp]);
  const companies = useMemo(
    () => options.companies.map((company) => ({ ...company, city: null })),
    [options.companies],
  );

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    const body = {
      type: values.type as FollowUpType,
      dueDate: values.dueDate,
      ownerMemberId:
        values.ownerMemberId === "" ? undefined : values.ownerMemberId,
      note: values.note.trim() === "" ? null : values.note.trim(),
    };
    try {
      if (followUp == null)
        await create.mutateAsync({
          ...body,
          prospectCompanyId: values.prospectCompanyId,
          visitId: visit?.id ?? null,
        });
      else
        await update.mutateAsync({
          ...body,
          expectedUpdatedAt: followUp.updatedAt,
        });
      onDone();
    } catch (caught) {
      const field = FIELDS[errorField(caught) ?? ""];
      if (field != null) {
        form.setError(field, { message: followUpErrorMessage(caught) });
        return;
      }
      setError(followUpErrorMessage(caught));
    }
  });

  const busy = form.formState.isSubmitting || remove.isPending;

  return (
    <form
      noValidate
      aria-label={title}
      className="flex min-w-0 flex-col gap-4"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      {fixed == null ? (
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="follow-up-company" required>
            Prospect Company
          </Label>
          <Controller
            control={form.control}
            name="prospectCompanyId"
            render={({ field }) => (
              <ProspectCompanyPicker
                id="follow-up-company"
                required
                companies={companies}
                value={field.value}
                invalid={errors.prospectCompanyId != null}
                onChange={field.onChange}
              />
            )}
          />
          <FieldError message={errors.prospectCompanyId?.message} />
        </div>
      ) : (
        <div className="min-w-0 space-y-1">
          <p className="text-muted-foreground text-xs">Prospect Company</p>
          <p className="text-sm font-medium break-words">
            {fixed.name}
            {visit == null ? null : (
              <span className="text-muted-foreground font-normal">{` · from ${visit.number}`}</span>
            )}
          </p>
          <FieldError message={errors.prospectCompanyId?.message} />
        </div>
      )}
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="follow-up-type" required>
            Type
          </Label>
          <Controller
            control={form.control}
            name="type"
            render={({ field }) => (
              <CompanySelect
                id="follow-up-type"
                required
                value={field.value}
                onChange={field.onChange}
                items={FOLLOW_UP_TYPE_ITEMS}
                placeholder="Choose the type"
                invalid={errors.type != null}
              />
            )}
          />
          <FieldError message={errors.type?.message} />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="follow-up-due" required>
            Due date
          </Label>
          <Input
            id="follow-up-due"
            type="date"
            aria-required
            aria-invalid={errors.dueDate != null}
            {...form.register("dueDate")}
          />
          <FieldError message={errors.dueDate?.message} />
        </div>
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor="follow-up-owner">Owner</Label>
        <Controller
          control={form.control}
          name="ownerMemberId"
          render={({ field }) => (
            <CompanySelect
              id="follow-up-owner"
              value={field.value}
              onChange={field.onChange}
              items={people}
              placeholder="You"
              invalid={errors.ownerMemberId != null}
            />
          )}
        />
        <FieldError message={errors.ownerMemberId?.message} />
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor="follow-up-note">Note</Label>
        <Textarea
          id="follow-up-note"
          rows={3}
          placeholder="Send the PEB warehouse rates"
          aria-invalid={errors.note != null}
          {...form.register("note")}
        />
        <FieldError message={errors.note?.message} />
      </div>
      <FormAlert message={error ?? undefined} />
      {deleting && followUp != null ? (
        <div
          role="group"
          aria-label="Delete Follow-up"
          className="flex flex-col gap-3 rounded-lg border border-red-300 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-red-800"
        >
          <p className="text-sm">
            Delete this Follow-up? It leaves every list.
          </p>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDeleting(false);
              }}
            >
              Keep
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => {
                setError(null);
                remove.mutate(
                  { expectedUpdatedAt: followUp.updatedAt },
                  {
                    onSuccess: onDone,
                    onError: (caught) => {
                      setDeleting(false);
                      setError(followUpErrorMessage(caught));
                    },
                  },
                );
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      ) : (
        <DialogFooter className="sm:justify-between">
          {followUp?.actions.canDelete === true ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive sm:mr-auto"
              onClick={() => {
                setDeleting(true);
              }}
            >
              Delete
            </Button>
          ) : (
            <span className="hidden sm:block" />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={onDone}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {form.formState.isSubmitting
                ? "Saving…"
                : followUp == null
                  ? "Add Follow-up"
                  : "Save"}
            </Button>
          </div>
        </DialogFooter>
      )}
    </form>
  );
}
