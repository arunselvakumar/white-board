"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm, type FieldPath } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
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
import { MARKETING_LIMITS } from "@/src/marketing/domain/marketing-terms";
import {
  companyErrorMessage,
  errorField,
  useContactCommand,
  type ProspectCompany,
  type ProspectCompanyContact,
} from "@/src/queries/marketing-companies";

const max = (limit: number, words: string) =>
  z.string().max(limit, `Keep the ${words} to ${String(limit)} characters.`);

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the Contact's name.")
    .max(
      MARKETING_LIMITS.name,
      `Keep the name to ${String(MARKETING_LIMITS.name)} characters.`,
    ),
  jobTitle: max(MARKETING_LIMITS.jobTitle, "job title"),
  mobile: z.string().max(20, "Enter a valid mobile number."),
  email: max(MARKETING_LIMITS.email, "email").refine(
    (value) =>
      value.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim()),
    "Enter a valid email address.",
  ),
  remarks: max(MARKETING_LIMITS.remarks, "remarks"),
  isPrimary: z.boolean(),
});
type Values = z.infer<typeof schema>;

const FIELDS = new Set<string>([
  "name",
  "jobTitle",
  "mobile",
  "email",
  "remarks",
]);

function values(
  contact: ProspectCompanyContact | null,
  firstContact: boolean,
): Values {
  return {
    name: contact?.name ?? "",
    jobTitle: contact?.jobTitle ?? "",
    mobile: contact?.mobile ?? "",
    email: contact?.email ?? "",
    remarks: contact?.remarks ?? "",
    isPrimary: contact?.isPrimary ?? firstContact,
  };
}

/**
 * Add or edit a Contact of a Prospect Company. The first Contact is always
 * primary, and the primary one stays so until another is made primary.
 * While a save is pending the dialog stays open, so its answer lands on
 * this opening and not on one opened after it.
 */
export function ContactDialog({
  company,
  contact,
  open,
  onOpenChange,
}: {
  company: ProspectCompany;
  /** Edit this Contact; null adds one. */
  contact: ProspectCompanyContact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const command = useContactCommand(company.id);
  const [error, setError] = useState<string | null>(null);
  const firstContact = company.contacts.length === 0;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: values(contact, firstContact),
  });
  const errors = form.formState.errors;
  const pending = form.formState.isSubmitting;
  const errorId = (field: keyof Values) => `contact-${field}-error`;
  const describedBy = (field: keyof Values) =>
    errors[field] == null ? undefined : errorId(field);
  const { reset } = form;
  // A different Contact (or Add after Edit) starts from its own values.
  useEffect(() => {
    if (open) reset(values(contact, firstContact));
  }, [open, contact, firstContact, reset]);
  const primaryFixed = firstContact || contact?.isPrimary === true;

  const dismiss = () => {
    setError(null);
    onOpenChange(false);
  };

  const submit = form.handleSubmit(async (input) => {
    setError(null);
    const orNull = (value: string) =>
      value.trim() === "" ? null : value.trim();
    const body = {
      name: input.name.trim(),
      jobTitle: orNull(input.jobTitle),
      mobile: orNull(input.mobile),
      email: orNull(input.email),
      remarks: orNull(input.remarks),
    };
    try {
      await command.mutateAsync(
        contact == null
          ? {
              kind: "create",
              input: { ...body, isPrimary: input.isPrimary },
            }
          : {
              kind: "update",
              contactId: contact.id,
              input: {
                ...body,
                ...(contact.isPrimary ? {} : { isPrimary: input.isPrimary }),
                expectedUpdatedAt: contact.updatedAt,
              },
            },
      );
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

  const title = contact == null ? "Add Contact" : `Edit ${contact.name}`;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else if (!pending) dismiss();
      }}
    >
      <DialogContent className="max-h-[90dvh] grid-cols-1 overflow-y-auto sm:max-w-lg">
        <form
          noValidate
          aria-label={title}
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle className="break-words">{title}</DialogTitle>
            <DialogDescription>{`A person at ${company.name}.`}</DialogDescription>
          </DialogHeader>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="contact-name" required>
                Name
              </Label>
              <Input
                id="contact-name"
                autoComplete="off"
                aria-required
                aria-invalid={errors.name != null}
                aria-describedby={describedBy("name")}
                {...form.register("name")}
              />
              <FieldError id={errorId("name")} message={errors.name?.message} />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="contact-jobTitle">Job title</Label>
              <Input
                id="contact-jobTitle"
                autoComplete="off"
                aria-invalid={errors.jobTitle != null}
                aria-describedby={describedBy("jobTitle")}
                {...form.register("jobTitle")}
              />
              <FieldError
                id={errorId("jobTitle")}
                message={errors.jobTitle?.message}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="contact-mobile">Mobile</Label>
              <Input
                id="contact-mobile"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="98450 12345"
                aria-invalid={errors.mobile != null}
                aria-describedby={describedBy("mobile")}
                {...form.register("mobile")}
              />
              <FieldError
                id={errorId("mobile")}
                message={errors.mobile?.message}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                type="email"
                autoComplete="off"
                aria-invalid={errors.email != null}
                aria-describedby={describedBy("email")}
                {...form.register("email")}
              />
              <FieldError
                id={errorId("email")}
                message={errors.email?.message}
              />
            </div>
            <div className="min-w-0 space-y-1.5 sm:col-span-2">
              <Label htmlFor="contact-remarks">Remarks</Label>
              <Textarea
                id="contact-remarks"
                rows={2}
                aria-invalid={errors.remarks != null}
                aria-describedby={describedBy("remarks")}
                {...form.register("remarks")}
              />
              <FieldError
                id={errorId("remarks")}
                message={errors.remarks?.message}
              />
            </div>
          </div>
          <Controller
            control={form.control}
            name="isPrimary"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="contact-isPrimary"
                  checked={field.value}
                  disabled={primaryFixed}
                  onCheckedChange={(checked) => {
                    field.onChange(checked);
                  }}
                />
                <Label htmlFor="contact-isPrimary" className="font-normal">
                  Primary Contact
                </Label>
              </div>
            )}
          />
          {primaryFixed && (
            <p className="text-muted-foreground -mt-2 text-xs">
              {firstContact
                ? "The first Contact is the primary one."
                : "Make another Contact primary to change this."}
            </p>
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
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
