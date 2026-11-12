"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ComponentProps, type ReactNode } from "react";
import { Controller, useForm, type FieldPath } from "react-hook-form";
import { z } from "zod";
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@repo/ui/components/autocomplete";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { cn } from "@repo/ui/lib/utils";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import {
  COMPANY_SOURCE_LABELS,
  COMPANY_SOURCES,
  MARKETING_LIMITS,
  type CompanySource,
} from "@/src/marketing/domain/marketing-terms";
import { QueryHttpError } from "@/src/queries/http";
import {
  companyErrorMessage,
  companyFormOptionsQuery,
  companyPath,
  errorField,
  useCreateCompany,
  useUpdateCompany,
  type ProspectCompany,
} from "@/src/queries/marketing-companies";
import { GST_STATES } from "@/src/shared-kernel/gst-states";

import { CompanySelect } from "./company-parts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const text = (limit: number, words: string) =>
  z.string().max(limit, `Keep the ${words} to ${String(limit)} characters.`);

const email = text(MARKETING_LIMITS.email, "email").refine(
  (value) => value.trim() === "" || EMAIL.test(value.trim()),
  "Enter a valid email address.",
);

const schema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter the company's name.")
      .max(
        MARKETING_LIMITS.name,
        `Keep the name to ${String(MARKETING_LIMITS.name)} characters.`,
      ),
    industry: text(MARKETING_LIMITS.industry, "industry"),
    address: text(MARKETING_LIMITS.address, "address"),
    city: text(MARKETING_LIMITS.city, "city"),
    stateCode: z.string(),
    pin: z
      .string()
      .refine(
        (value) => value.trim() === "" || /^\d{6}$/.test(value.trim()),
        "Enter the six-digit PIN.",
      ),
    phone: text(MARKETING_LIMITS.phone, "phone"),
    email,
    website: text(MARKETING_LIMITS.website, "website"),
    gstin: z
      .string()
      .refine(
        (value) => value.trim() === "" || value.trim().length === 15,
        "A GSTIN has 15 characters.",
      ),
    source: z.string(),
    assignedMemberId: z.string(),
    remarks: text(MARKETING_LIMITS.remarks, "remarks"),
    contact: z.object({
      name: text(MARKETING_LIMITS.name, "name"),
      jobTitle: text(MARKETING_LIMITS.jobTitle, "job title"),
      mobile: z.string().max(20, "Enter a valid mobile number."),
      email,
    }),
  })
  .superRefine((value, ctx) => {
    const { contact } = value;
    const typed =
      contact.jobTitle.trim() !== "" ||
      contact.mobile.trim() !== "" ||
      contact.email.trim() !== "";
    if (typed && contact.name.trim() === "")
      ctx.addIssue({
        code: "custom",
        message: "Enter the Contact's name, or clear the Contact.",
        path: ["contact", "name"],
      });
  });
type Values = z.infer<typeof schema>;

/** Company fields the server names in `details.field`. */
const COMPANY_FIELDS = new Set<string>([
  "name",
  "industry",
  "address",
  "city",
  "stateCode",
  "pin",
  "phone",
  "email",
  "website",
  "gstin",
  "source",
  "assignedMemberId",
  "remarks",
]);

const CONTACT_FIELDS = new Set<string>(["name", "jobTitle", "mobile", "email"]);

/** The form field a server refusal is about, if any. */
function serverField(error: unknown): FieldPath<Values> | null {
  const field = errorField(error);
  if (field == null || !(error instanceof QueryHttpError)) return null;
  if (error.code.startsWith("CONTACT_"))
    return CONTACT_FIELDS.has(field)
      ? (`contact.${field}` as FieldPath<Values>)
      : null;
  return COMPANY_FIELDS.has(field) ? (field as FieldPath<Values>) : null;
}

const STATE_ITEMS = GST_STATES.map((state) => ({
  value: state.code,
  label: state.name,
}));

const SOURCE_ITEMS = COMPANY_SOURCES.map((source) => ({
  value: source,
  label: COMPANY_SOURCE_LABELS[source],
}));

function defaults(company: ProspectCompany | undefined): Values {
  return {
    name: company?.name ?? "",
    industry: company?.industry ?? "",
    address: company?.address ?? "",
    city: company?.city ?? "",
    stateCode: company?.stateCode ?? "",
    pin: company?.pin ?? "",
    phone: company?.phone ?? "",
    email: company?.email ?? "",
    website: company?.website ?? "",
    gstin: company?.gstin ?? "",
    source: company?.source ?? "",
    assignedMemberId: "",
    remarks: company?.remarks ?? "",
    contact: { name: "", jobTitle: "", mobile: "", email: "" },
  };
}

/** Industries already typed that match, minus an exact match. */
function industrySuggestions(
  industries: readonly string[],
  typed: string,
): string[] {
  const query = typed.trim().toLowerCase();
  return industries
    .filter((industry) => {
      const key = industry.toLowerCase();
      return query === "" || (key.includes(query) && key !== query);
    })
    .slice(0, 8);
}

/**
 * Add or edit a Prospect Company (PRD §3.3). Adding may name the first
 * Contact, made primary, and an active Marketing Person (the person adding
 * it when left as Me). Editing shows the assigned person read-only: only
 * Reassign moves it.
 */
export function CompanyForm({ company }: { company?: ProspectCompany }) {
  const router = useRouter();
  const { data: options } = useSuspenseQuery(companyFormOptionsQuery);
  const create = useCreateCompany();
  const update = useUpdateCompany(company?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults(company),
  });
  const errors = form.formState.errors;
  const people = options.people
    .filter((person) => person.active)
    .map((person) => ({
      value: person.id,
      label: person.isOwner ? `${person.name} (Owner)` : person.name,
    }));

  const submit = form.handleSubmit(async (input) => {
    setError(null);
    const orNull = (value: string) =>
      value.trim() === "" ? null : value.trim();
    const details = {
      name: input.name.trim(),
      industry: orNull(input.industry),
      address: orNull(input.address),
      city: orNull(input.city),
      stateCode: orNull(input.stateCode),
      pin: orNull(input.pin),
      phone: orNull(input.phone),
      email: orNull(input.email),
      website: orNull(input.website),
      gstin: orNull(input.gstin)?.toUpperCase() ?? null,
      source: orNull(input.source) as CompanySource | null,
      remarks: orNull(input.remarks),
    };
    try {
      let saved: ProspectCompany;
      if (company == null) {
        const contactName = orNull(input.contact.name);
        saved = await create.mutateAsync({
          ...details,
          ...(input.assignedMemberId === ""
            ? {}
            : { assignedMemberId: input.assignedMemberId }),
          primaryContact:
            contactName == null
              ? null
              : {
                  name: contactName,
                  jobTitle: orNull(input.contact.jobTitle),
                  mobile: orNull(input.contact.mobile),
                  email: orNull(input.contact.email),
                },
        });
      } else {
        saved = await update.mutateAsync({
          ...details,
          expectedUpdatedAt: company.updatedAt,
        });
      }
      setLeaving(true);
      router.push(companyPath(saved.id));
    } catch (caught) {
      const field = serverField(caught);
      if (field != null) {
        form.setError(field, { message: companyErrorMessage(caught) });
        form.setFocus(field);
        return;
      }
      setError(companyErrorMessage(caught));
    }
  });

  const busy = form.formState.isSubmitting || leaving;
  const field = (
    name: FieldPath<Values>,
    label: string,
    control: ReactNode,
    options: { className?: string; required?: boolean; message?: string } = {},
  ) => (
    <div className={cn("min-w-0 space-y-1.5", options.className)}>
      <Label
        htmlFor={`company-${name.replace(".", "-")}`}
        required={options.required}
      >
        {label}
      </Label>
      {control}
      <FieldError message={options.message} />
    </div>
  );
  const input = (
    name: Exclude<
      FieldPath<Values>,
      "contact" | "stateCode" | "source" | "assignedMemberId"
    >,
    extra: ComponentProps<typeof Input> = {},
  ) => (
    <Input
      id={`company-${name.replace(".", "-")}`}
      autoComplete="off"
      aria-invalid={form.getFieldState(name, form.formState).invalid}
      {...extra}
      {...form.register(name)}
    />
  );

  return (
    <form
      noValidate
      aria-label={
        company == null ? "New Prospect Company" : `Edit ${company.name}`
      }
      className="w-full max-w-4xl space-y-6"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <section
        aria-labelledby="company-details-heading"
        className="bg-card grid min-w-0 gap-4 rounded-xl border p-4 sm:grid-cols-2 sm:p-5"
      >
        <h2
          id="company-details-heading"
          className="font-semibold sm:col-span-2"
        >
          Details
        </h2>
        {field("name", "Name", input("name", { "aria-required": true }), {
          required: true,
          message: errors.name?.message,
        })}
        {field(
          "industry",
          "Industry",
          <Controller
            control={form.control}
            name="industry"
            render={({ field: control }) => {
              const items = industrySuggestions(
                options.industries,
                control.value,
              );
              return (
                <Autocomplete
                  items={items}
                  mode="none"
                  filter={null}
                  openOnInputClick
                  value={control.value}
                  onValueChange={(value) => {
                    control.onChange(value);
                  }}
                >
                  <AutocompleteInput
                    id="company-industry"
                    ref={control.ref}
                    name={control.name}
                    onBlur={control.onBlur}
                    autoComplete="off"
                    placeholder="Steel fabrication"
                    aria-invalid={errors.industry != null}
                  />
                  {items.length === 0 ? null : (
                    <AutocompleteContent>
                      <AutocompleteList aria-label="Industries already used">
                        {(item: string) => (
                          <AutocompleteItem key={item} value={item}>
                            {item}
                          </AutocompleteItem>
                        )}
                      </AutocompleteList>
                    </AutocompleteContent>
                  )}
                </Autocomplete>
              );
            }}
          />,
          { message: errors.industry?.message },
        )}
        {field(
          "address",
          "Address",
          <Textarea
            id="company-address"
            rows={2}
            aria-invalid={errors.address != null}
            {...form.register("address")}
          />,
          { className: "sm:col-span-2", message: errors.address?.message },
        )}
        {field("city", "City", input("city"), {
          message: errors.city?.message,
        })}
        {field(
          "stateCode",
          "State",
          <Controller
            control={form.control}
            name="stateCode"
            render={({ field: control }) => (
              <CompanySelect
                id="company-stateCode"
                value={control.value}
                onChange={control.onChange}
                noneLabel="Not set"
                invalid={errors.stateCode != null}
                items={STATE_ITEMS}
              />
            )}
          />,
          { message: errors.stateCode?.message },
        )}
        {field("pin", "PIN", input("pin", { inputMode: "numeric" }), {
          message: errors.pin?.message,
        })}
        {field("phone", "Phone", input("phone", { type: "tel" }), {
          message: errors.phone?.message,
        })}
        {field("email", "Email", input("email", { type: "email" }), {
          message: errors.email?.message,
        })}
        {field(
          "website",
          "Website",
          input("website", { placeholder: "example.com" }),
          { message: errors.website?.message },
        )}
        {field(
          "gstin",
          "GSTIN",
          input("gstin", { className: "uppercase", maxLength: 15 }),
          { message: errors.gstin?.message },
        )}
        {field(
          "source",
          "Source",
          <Controller
            control={form.control}
            name="source"
            render={({ field: control }) => (
              <CompanySelect
                id="company-source"
                value={control.value}
                onChange={control.onChange}
                noneLabel="Not known"
                invalid={errors.source != null}
                items={SOURCE_ITEMS}
              />
            )}
          />,
          { message: errors.source?.message },
        )}
        {company == null ? (
          field(
            "assignedMemberId",
            "Marketing Person",
            <Controller
              control={form.control}
              name="assignedMemberId"
              render={({ field: control }) => (
                <CompanySelect
                  id="company-assignedMemberId"
                  value={control.value}
                  onChange={control.onChange}
                  noneLabel="Me"
                  invalid={errors.assignedMemberId != null}
                  items={people}
                />
              )}
            />,
            { message: errors.assignedMemberId?.message },
          )
        ) : (
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="company-assignedTo">Marketing Person</Label>
            <Input
              id="company-assignedTo"
              readOnly
              disabled
              value={company.assignedTo?.name ?? "No one"}
            />
          </div>
        )}
        {field(
          "remarks",
          "Remarks",
          <Textarea
            id="company-remarks"
            rows={3}
            aria-invalid={errors.remarks != null}
            {...form.register("remarks")}
          />,
          { className: "sm:col-span-2", message: errors.remarks?.message },
        )}
      </section>

      {company == null && (
        <section
          aria-labelledby="company-contact-heading"
          className="bg-card grid min-w-0 gap-4 rounded-xl border p-4 sm:grid-cols-2 sm:p-5"
        >
          <div className="space-y-1 sm:col-span-2">
            <h2 id="company-contact-heading" className="font-semibold">
              Primary Contact
            </h2>
            <p className="text-muted-foreground text-sm">
              Optional. The person you deal with there; add more Contacts on the
              company&apos;s page.
            </p>
          </div>
          {field("contact.name", "Contact name", input("contact.name"), {
            message: errors.contact?.name?.message,
          })}
          {field("contact.jobTitle", "Job title", input("contact.jobTitle"), {
            message: errors.contact?.jobTitle?.message,
          })}
          {field(
            "contact.mobile",
            "Contact mobile",
            input("contact.mobile", {
              type: "tel",
              inputMode: "tel",
              placeholder: "98450 12345",
            }),
            { message: errors.contact?.mobile?.message },
          )}
          {field(
            "contact.email",
            "Contact email",
            input("contact.email", { type: "email" }),
            { message: errors.contact?.email?.message },
          )}
        </section>
      )}

      <FormAlert message={error ?? undefined} />
      <div className="flex flex-wrap justify-end gap-2">
        <Link
          href={company == null ? companyPath() : companyPath(company.id)}
          className={buttonVariants({ variant: "outline" })}
        >
          Cancel
        </Link>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
