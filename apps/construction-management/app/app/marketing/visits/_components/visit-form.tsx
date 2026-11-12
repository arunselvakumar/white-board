"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type FieldPath,
} from "react-hook-form";
import { z } from "zod";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label, RequiredIndicator } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { cn } from "@repo/ui/lib/utils";

import { ChipsSelect } from "@/app/app/_components/tracking/tasks/chips-select";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { MoneyInput } from "@/components/money/money-input";
import {
  FOLLOW_UP_LIMITS,
  FOLLOW_UP_TYPE_LABELS,
  FOLLOW_UP_TYPES,
  INTEREST_LABELS,
  INTERESTS,
  MARKETING_LIMITS,
  VISIT_LIMITS,
  VISIT_PURPOSE_LABELS,
  VISIT_PURPOSES,
  WORK_TYPE_LABELS,
  WORK_TYPES,
  type FollowUpType,
  type Interest,
  type VisitPurpose,
  type WorkType,
} from "@/src/marketing/domain/marketing-terms";
import { QueryHttpError } from "@/src/queries/http";
import { companyQuery } from "@/src/queries/marketing-companies";
import {
  useCompleteVisit,
  useCreateVisit,
  useUpdateVisit,
  visitErrorMessage,
  visitFormOptionsQuery,
  visitPath,
  type Visit,
} from "@/src/queries/marketing-visits";

import { CompanySelect } from "../../companies/_components/company-parts";
import {
  ProspectCompanyPicker,
  type CompanyChoice,
} from "./prospect-company-picker";
import { zoneFields, zoneIso } from "./visit-parts";

/** Contacts added in one save (the server's limit). */
const MAX_NEW_CONTACTS = 5;

const text = (limit: number, words: string) =>
  z.string().max(limit, `Keep the ${words} to ${String(limit)} characters.`);

const newContact = z.object({
  name: text(MARKETING_LIMITS.name, "name"),
  jobTitle: text(MARKETING_LIMITS.jobTitle, "job title"),
  mobile: z.string().max(20, "Enter a valid mobile number."),
});

const values = z.object({
  companyMode: z.enum(["existing", "new"]),
  prospectCompanyId: z.string(),
  newCompany: z.object({
    name: text(MARKETING_LIMITS.name, "name"),
    city: text(MARKETING_LIMITS.city, "city"),
    phone: text(MARKETING_LIMITS.phone, "phone"),
    contactName: text(MARKETING_LIMITS.name, "name"),
    contactMobile: z.string().max(20, "Enter a valid mobile number."),
  }),
  contactIds: z.array(z.string()),
  newContacts: z.array(newContact),
  visitorIds: z.array(z.string()).min(1, "Choose who is visiting."),
  date: z.string().min(1, "Choose the date."),
  time: z.string().min(1, "Enter the time."),
  purpose: z.string(),
  location: text(VISIT_LIMITS.location, "location"),
  discussion: text(VISIT_LIMITS.discussion, "discussion"),
  outcome: text(VISIT_LIMITS.outcome, "outcome"),
  interest: z.string(),
  requirementWorkType: z.string(),
  requirementValue: z
    .string()
    .refine(
      (value) => value.trim() === "" || /^\d+$/.test(value.replace(/,/g, "")),
      "Enter the approximate value in whole rupees.",
    ),
  requirementStartMonth: z.string(),
  nextFollowUp: z.object({
    enabled: z.boolean(),
    type: z.string(),
    dueDate: z.string(),
    ownerMemberId: z.string(),
    note: text(FOLLOW_UP_LIMITS.note, "note"),
  }),
});
type Values = z.infer<typeof values>;

const IN_FUTURE =
  "A completed Visit cannot be in the future. Plan it instead, or correct the time.";

/** The rules that depend on what is being saved. */
function schema(input: { completing: boolean; timeZone: string; now: Date }) {
  return values.superRefine((value, ctx) => {
    if (value.companyMode === "existing" && value.prospectCompanyId === "")
      ctx.addIssue({
        code: "custom",
        message: "Choose the Prospect Company, or add it.",
        path: ["prospectCompanyId"],
      });
    if (value.companyMode === "new" && value.newCompany.name.trim() === "")
      ctx.addIssue({
        code: "custom",
        message: "Enter the company's name.",
        path: ["newCompany", "name"],
      });
    if (
      value.companyMode === "new" &&
      value.newCompany.contactName.trim() === "" &&
      value.newCompany.contactMobile.trim() !== ""
    )
      ctx.addIssue({
        code: "custom",
        message: "Enter the Contact's name, or clear the mobile.",
        path: ["newCompany", "contactName"],
      });
    if (value.nextFollowUp.enabled && value.nextFollowUp.type === "")
      ctx.addIssue({
        code: "custom",
        message: "Choose the type of Follow-up.",
        path: ["nextFollowUp", "type"],
      });
    if (value.nextFollowUp.enabled && value.nextFollowUp.dueDate === "")
      ctx.addIssue({
        code: "custom",
        message: "Choose the date it is due.",
        path: ["nextFollowUp", "dueDate"],
      });
    value.newContacts.forEach((row, index) => {
      if (row.name.trim() === "")
        ctx.addIssue({
          code: "custom",
          message: "Enter the Contact's name, or remove the row.",
          path: ["newContacts", index, "name"],
        });
    });
    if (!input.completing) return;
    const met =
      value.contactIds.length +
      value.newContacts.length +
      (value.companyMode === "new" && value.newCompany.contactName.trim() !== ""
        ? 1
        : 0);
    if (met === 0)
      ctx.addIssue({
        code: "custom",
        message: "Add the person you met to complete the Visit.",
        path: ["contactIds"],
      });
    if (value.discussion.trim() === "")
      ctx.addIssue({
        code: "custom",
        message: "Write what was discussed to complete the Visit.",
        path: ["discussion"],
      });
    if (
      value.date !== "" &&
      value.time !== "" &&
      new Date(zoneIso(value.date, value.time, input.timeZone)).getTime() >
        input.now.getTime()
    )
      ctx.addIssue({ code: "custom", message: IN_FUTURE, path: ["date"] });
  });
}

/** Form fields the server names in `details.field`. */
const SERVER_FIELDS: Record<string, FieldPath<Values>> = {
  visitAt: "date",
  contactIds: "contactIds",
  newContacts: "contactIds",
  discussion: "discussion",
  visitorIds: "visitorIds",
  prospectCompanyId: "prospectCompanyId",
  location: "location",
  outcome: "outcome",
  requirementValue: "requirementValue",
  requirementStartMonth: "requirementStartMonth",
};

/** The form field a server refusal is about, if any. */
function serverField(
  error: unknown,
  companyNew: boolean,
): FieldPath<Values> | null {
  if (!(error instanceof QueryHttpError)) return null;
  const raw = (error.details as { field?: unknown } | undefined)?.field;
  if (typeof raw !== "string") return null;
  if (error.code.startsWith("FOLLOW_UP_") || raw === "ownerMemberId")
    return raw === "dueDate" || raw === "note" || raw === "ownerMemberId"
      ? `nextFollowUp.${raw}`
      : null;
  if (error.code.startsWith("PROSPECT_COMPANY_"))
    return companyNew && raw === "name" ? "newCompany.name" : null;
  if (error.code.startsWith("CONTACT_")) return "contactIds";
  return SERVER_FIELDS[raw] ?? null;
}

export type VisitFormMode =
  | {
      kind: "new";
      status: "planned" | "completed";
      prospectCompanyId?: string;
      /** Filled in by Log the visit from a Follow-up. */
      contactIds?: readonly string[];
      visitorIds?: readonly string[];
    }
  | { kind: "edit"; visit: Visit }
  | { kind: "complete"; visit: Visit };

const PURPOSE_ITEMS = VISIT_PURPOSES.map((key) => ({
  value: key,
  label: VISIT_PURPOSE_LABELS[key],
}));
const INTEREST_ITEMS = INTERESTS.map((key) => ({
  value: key,
  label: INTEREST_LABELS[key],
}));
const WORK_TYPE_ITEMS = WORK_TYPES.map((key) => ({
  value: key,
  label: WORK_TYPE_LABELS[key],
}));

const FOLLOW_UP_TYPE_ITEMS = FOLLOW_UP_TYPES.map((key) => ({
  value: key,
  label: FOLLOW_UP_TYPE_LABELS[key],
}));

const BLANK_COMPANY: Values["newCompany"] = {
  name: "",
  city: "",
  phone: "",
  contactName: "",
  contactMobile: "",
};

function defaults(
  mode: VisitFormMode,
  input: {
    selfMemberId: string | null;
    mustIncludeSelf: boolean;
    timeZone: string;
    now: Date;
  },
): Values {
  const nextFollowUp: Values["nextFollowUp"] = {
    enabled: false,
    type: "",
    dueDate: "",
    ownerMemberId: input.selfMemberId ?? "",
    note: "",
  };
  if (mode.kind === "new") {
    const now = zoneFields(input.now, input.timeZone);
    const logging = mode.status === "completed";
    const self = input.selfMemberId;
    const given = [...(mode.visitorIds ?? [])];
    const visitorIds =
      given.length === 0
        ? self == null
          ? []
          : [self]
        : input.mustIncludeSelf && self != null && !given.includes(self)
          ? [self, ...given]
          : given;
    return {
      companyMode: "existing",
      prospectCompanyId: mode.prospectCompanyId ?? "",
      newCompany: BLANK_COMPANY,
      contactIds: [...(mode.contactIds ?? [])],
      newContacts: [],
      visitorIds,
      date: now.date,
      time: logging ? now.time : "",
      purpose: "",
      location: "",
      discussion: "",
      outcome: "",
      interest: "",
      requirementWorkType: "",
      requirementValue: "",
      requirementStartMonth: "",
      nextFollowUp,
    };
  }
  const { visit } = mode;
  const planned = new Date(visit.visitAt);
  // Completing: the planned time, or now when that is still ahead.
  const at =
    mode.kind === "complete" && planned.getTime() > input.now.getTime()
      ? input.now
      : planned;
  const when = zoneFields(at, input.timeZone);
  return {
    companyMode: "existing",
    prospectCompanyId: visit.prospectCompany.id,
    newCompany: BLANK_COMPANY,
    contactIds: visit.contacts.map((contact) => contact.id),
    newContacts: [],
    visitorIds: visit.visitors.map((person) => person.id),
    date: when.date,
    time: when.time,
    purpose: visit.purpose ?? "",
    location: visit.location ?? "",
    discussion: visit.discussion ?? "",
    outcome: visit.outcome ?? "",
    interest: visit.interest ?? "",
    requirementWorkType: visit.requirementWorkType ?? "",
    requirementValue:
      visit.requirementValue == null ? "" : String(visit.requirementValue),
    requirementStartMonth: visit.requirementStartMonth ?? "",
    nextFollowUp,
  };
}

const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

/**
 * Plan a Visit, log a completed one, edit one, or complete a planned one
 * (PRD §3.4). The company is picked or added inline; points of contact are
 * its Contacts, or added inline; Visited by starts with the caller. Date
 * and time are in the Company time zone. A planned Visit's time changes
 * only by Reschedule, so Edit shows it read-only. Plan, Log and Complete
 * may add a Next Follow-up, saved with the Visit.
 */
export function VisitForm({
  mode,
  now = new Date(),
  canAddFollowUp = false,
}: {
  mode: VisitFormMode;
  /** Fixed in stories; the device's clock otherwise. */
  now?: Date;
  /** Follow-ups create: the Next Follow-up section. */
  canAddFollowUp?: boolean;
}) {
  const router = useRouter();
  const { data: options } = useSuspenseQuery(visitFormOptionsQuery);
  const visit = mode.kind === "new" ? null : mode.visit;
  const timeZone = visit?.timeZone ?? options.timeZone;
  const completing =
    mode.kind === "complete" ||
    (mode.kind === "new" && mode.status === "completed") ||
    (mode.kind === "edit" && mode.visit.status === "completed");
  const timeLocked = mode.kind === "edit" && mode.visit.status !== "completed";
  const create = useCreateVisit();
  const update = useUpdateVisit(visit?.id ?? "");
  const complete = useCompleteVisit(visit?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema({ completing, timeZone, now })),
    defaultValues: defaults(mode, {
      selfMemberId: options.selfMemberId,
      mustIncludeSelf: options.mustIncludeSelf,
      timeZone,
      now,
    }),
  });
  const errors = form.formState.errors;
  const extra = useFieldArray({ control: form.control, name: "newContacts" });
  const companyMode = useWatch({ control: form.control, name: "companyMode" });
  const companyId = useWatch({
    control: form.control,
    name: "prospectCompanyId",
  });
  const companyNew = companyMode === "new";
  const followUpShown = canAddFollowUp && mode.kind !== "edit";
  const followUpOn = useWatch({
    control: form.control,
    name: "nextFollowUp.enabled",
  });

  // The Visit's own company stays pickable even when the viewer cannot open it.
  const companies = useMemo<(CompanyChoice & { address: string | null })[]>(
    () =>
      visit == null ||
      options.companies.some((c) => c.id === visit.prospectCompany.id)
        ? options.companies
        : [visit.prospectCompany, ...options.companies],
    [options.companies, visit],
  );
  const picked = companies.find((company) => company.id === companyId) ?? null;

  // The company's Contacts; the Visit's own when the viewer cannot read it.
  const detail = useQuery({
    ...companyQuery(companyId),
    enabled: !companyNew && companyId !== "",
    retry: false,
  });
  const contactChoices = useMemo(() => {
    const known = new Map<string, { id: string; name: string }>();
    if (visit?.prospectCompany.id === companyId)
      for (const contact of visit.contacts) known.set(contact.id, contact);
    for (const contact of detail.data?.contacts ?? [])
      known.set(contact.id, {
        id: contact.id,
        name:
          contact.jobTitle == null
            ? contact.name
            : `${contact.name} · ${contact.jobTitle}`,
      });
    return [...known.values()];
  }, [detail.data, visit, companyId]);

  const people = useMemo(() => {
    const known = new Map<string, { id: string; name: string }>();
    for (const person of options.people)
      known.set(person.id, { id: person.id, name: person.name });
    for (const person of visit?.visitors ?? [])
      if (!known.has(person.id)) known.set(person.id, person);
    return [...known.values()];
  }, [options.people, visit]);
  const owners = useMemo(
    () =>
      options.people
        .filter((person) => person.active)
        .map((person) => ({ value: person.id, label: person.name })),
    [options.people],
  );
  const self = options.selfMemberId;
  const keepSelf = options.mustIncludeSelf && self != null;
  const withSelf = (ids: string[]) =>
    options.mustIncludeSelf && self != null && !ids.includes(self)
      ? [self, ...ids]
      : ids;

  const canAddContacts =
    companyNew || (options.canAddContacts && companyId !== "");
  const primaryName = useWatch({
    control: form.control,
    name: "newCompany.contactName",
  });
  const newContactLimit =
    MAX_NEW_CONTACTS - (companyNew && primaryName.trim() !== "" ? 1 : 0);

  const submit = form.handleSubmit(async (input) => {
    setError(null);
    const rupees = input.requirementValue.replace(/,/g, "").trim();
    const contacts = input.newContacts.map((row) => ({
      name: row.name.trim(),
      jobTitle: orNull(row.jobTitle),
      mobile: orNull(row.mobile),
    }));
    const primary = orNull(input.newCompany.contactName);
    const next = input.nextFollowUp;
    const nextFollowUp =
      followUpShown && next.enabled
        ? {
            type: next.type as FollowUpType,
            dueDate: next.dueDate,
            ownerMemberId:
              next.ownerMemberId === "" ? undefined : next.ownerMemberId,
            note: orNull(next.note),
          }
        : undefined;
    const body = {
      visitAt:
        timeLocked && visit != null
          ? visit.visitAt
          : zoneIso(input.date, input.time, timeZone),
      purpose: orNull(input.purpose) as VisitPurpose | null,
      location: orNull(input.location),
      discussion: orNull(input.discussion),
      outcome: orNull(input.outcome),
      interest: orNull(input.interest) as Interest | null,
      requirementWorkType: orNull(input.requirementWorkType) as WorkType | null,
      requirementValue: rupees === "" ? null : Number(rupees),
      requirementStartMonth: orNull(input.requirementStartMonth),
      visitorIds: input.visitorIds,
      contactIds: companyNew ? [] : input.contactIds,
      // A new company's primary Contact is its first Contact, and met.
      newContacts:
        companyNew && primary != null
          ? [
              {
                name: primary,
                jobTitle: null,
                mobile: orNull(input.newCompany.contactMobile),
              },
              ...contacts,
            ]
          : contacts,
    };
    try {
      let saved: Visit;
      if (mode.kind === "new") {
        saved = await create.mutateAsync({
          ...body,
          nextFollowUp,
          status: mode.status,
          ...(companyNew
            ? {
                newProspectCompany: {
                  name: input.newCompany.name.trim(),
                  city: orNull(input.newCompany.city),
                  phone: orNull(input.newCompany.phone),
                },
              }
            : { prospectCompanyId: input.prospectCompanyId }),
        });
      } else if (mode.kind === "edit") {
        saved = await update.mutateAsync({
          ...body,
          prospectCompanyId: input.prospectCompanyId,
          expectedUpdatedAt: mode.visit.updatedAt,
        });
      } else {
        saved = await complete.mutateAsync({
          ...body,
          nextFollowUp,
          expectedUpdatedAt: mode.visit.updatedAt,
        });
      }
      setLeaving(true);
      router.push(visitPath(saved.id));
    } catch (caught) {
      const field = serverField(caught, companyNew);
      if (field != null) {
        form.setError(field, { message: visitErrorMessage(caught) });
        return;
      }
      setError(visitErrorMessage(caught));
    }
  });

  const busy = form.formState.isSubmitting || leaving;
  const field = (
    id: string,
    label: string,
    control: ReactNode,
    extras: {
      className?: string;
      required?: boolean;
      message?: string;
      hint?: string;
    } = {},
  ) => (
    <div className={cn("min-w-0 space-y-1.5", extras.className)}>
      <Label htmlFor={id} required={extras.required}>
        {label}
      </Label>
      {control}
      {extras.hint == null ? null : (
        <p className="text-muted-foreground text-xs">{extras.hint}</p>
      )}
      <FieldError message={extras.message} />
    </div>
  );
  const selectField = (
    name: "purpose" | "interest" | "requirementWorkType",
    id: string,
    items: readonly { value: string; label: string }[],
    noneLabel: string,
  ) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field: control }) => (
        <CompanySelect
          id={id}
          value={control.value}
          onChange={control.onChange}
          noneLabel={noneLabel}
          items={items}
        />
      )}
    />
  );

  const label =
    mode.kind === "new"
      ? mode.status === "planned"
        ? "Plan Visit"
        : "Log Visit"
      : mode.kind === "edit"
        ? `Edit ${mode.visit.number}`
        : `Complete ${mode.visit.number}`;

  return (
    <form
      noValidate
      aria-label={label}
      className="w-full max-w-4xl space-y-6"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <section
        aria-labelledby="visit-company-heading"
        className="bg-card grid min-w-0 gap-4 rounded-xl border p-4 sm:grid-cols-2 sm:p-5"
      >
        <h2 id="visit-company-heading" className="font-semibold sm:col-span-2">
          Prospect Company
        </h2>
        {companyNew ? (
          <>
            {field(
              "visit-new-company-name",
              "Company name",
              <Input
                id="visit-new-company-name"
                autoComplete="off"
                aria-required
                aria-invalid={errors.newCompany?.name != null}
                {...form.register("newCompany.name")}
              />,
              { required: true, message: errors.newCompany?.name?.message },
            )}
            {field(
              "visit-new-company-city",
              "City",
              <Input
                id="visit-new-company-city"
                autoComplete="off"
                {...form.register("newCompany.city")}
              />,
              { message: errors.newCompany?.city?.message },
            )}
            {field(
              "visit-new-company-phone",
              "Phone",
              <Input
                id="visit-new-company-phone"
                type="tel"
                autoComplete="off"
                {...form.register("newCompany.phone")}
              />,
              { message: errors.newCompany?.phone?.message },
            )}
            <div className="hidden sm:block" />
            {field(
              "visit-new-company-contact",
              "Primary Contact",
              <Input
                id="visit-new-company-contact"
                autoComplete="off"
                placeholder="The person you deal with there"
                aria-invalid={errors.newCompany?.contactName != null}
                {...form.register("newCompany.contactName")}
              />,
              {
                message: errors.newCompany?.contactName?.message,
                hint: "Optional. Also a point of contact on this Visit.",
              },
            )}
            {field(
              "visit-new-company-mobile",
              "Primary Contact mobile",
              <Input
                id="visit-new-company-mobile"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="98450 12345"
                {...form.register("newCompany.contactMobile")}
              />,
              { message: errors.newCompany?.contactMobile?.message },
            )}
            <div className="sm:col-span-2">
              <Button
                type="button"
                variant="link"
                className="h-auto p-0"
                onClick={() => {
                  form.setValue("companyMode", "existing");
                  form.setValue("newCompany", BLANK_COMPANY);
                  form.clearErrors("newCompany");
                }}
              >
                Pick an existing company instead
              </Button>
            </div>
          </>
        ) : (
          <>
            {field(
              "visit-company",
              "Prospect Company",
              <Controller
                control={form.control}
                name="prospectCompanyId"
                render={({ field: control }) => (
                  <ProspectCompanyPicker
                    id="visit-company"
                    required
                    companies={companies}
                    value={control.value}
                    disabled={mode.kind === "complete"}
                    invalid={errors.prospectCompanyId != null}
                    onChange={(next) => {
                      control.onChange(next);
                      form.setValue("contactIds", []);
                      form.setValue("newContacts", []);
                    }}
                  />
                )}
              />,
              {
                required: true,
                className: "sm:col-span-2",
                message: errors.prospectCompanyId?.message,
              },
            )}
            {mode.kind === "new" && options.canCreateCompany && (
              <div className="sm:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    form.setValue("companyMode", "new");
                    form.setValue("prospectCompanyId", "");
                    form.setValue("contactIds", []);
                    form.clearErrors("prospectCompanyId");
                  }}
                >
                  <Plus aria-hidden="true" />
                  Add a new company
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      <section
        aria-labelledby="visit-people-heading"
        className="bg-card grid min-w-0 gap-4 rounded-xl border p-4 sm:grid-cols-2 sm:p-5"
      >
        <h2 id="visit-people-heading" className="font-semibold sm:col-span-2">
          People
        </h2>
        <div className="min-w-0 space-y-1.5 sm:col-span-2">
          <Label htmlFor="visit-contacts" required={completing}>
            Points of contact
          </Label>
          {companyNew ? (
            <p className="text-muted-foreground text-sm">
              The primary Contact above, and anyone you add here.
            </p>
          ) : companyId === "" ? (
            <p className="text-muted-foreground text-sm">
              Choose the Prospect Company to see its Contacts.
            </p>
          ) : (
            <Controller
              control={form.control}
              name="contactIds"
              render={({ field: control }) => (
                <ChipsSelect
                  id="visit-contacts"
                  label="Contacts"
                  options={contactChoices}
                  value={control.value}
                  onChange={control.onChange}
                  invalid={errors.contactIds != null}
                  required={completing}
                  placeholder={
                    detail.isPending && detail.fetchStatus !== "idle"
                      ? "Loading Contacts…"
                      : "Choose who you met"
                  }
                  emptyText="No Contacts yet. Add one below."
                />
              )}
            />
          )}
          <FieldError message={errors.contactIds?.message} />
          {extra.fields.length > 0 && (
            <ul aria-label="New Contacts" className="space-y-3 pt-1">
              {extra.fields.map((row, index) => (
                <li
                  key={row.id}
                  className="grid min-w-0 gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-start"
                >
                  <div className="min-w-0 space-y-1">
                    <Label
                      htmlFor={`visit-new-contact-${String(index)}-name`}
                      required
                    >
                      Name
                    </Label>
                    <Input
                      id={`visit-new-contact-${String(index)}-name`}
                      autoComplete="off"
                      aria-required
                      aria-invalid={errors.newContacts?.[index]?.name != null}
                      {...form.register(`newContacts.${index}.name`)}
                    />
                    <FieldError
                      message={errors.newContacts?.[index]?.name?.message}
                    />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <Label htmlFor={`visit-new-contact-${String(index)}-job`}>
                      Job title
                    </Label>
                    <Input
                      id={`visit-new-contact-${String(index)}-job`}
                      autoComplete="off"
                      {...form.register(`newContacts.${index}.jobTitle`)}
                    />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <Label
                      htmlFor={`visit-new-contact-${String(index)}-mobile`}
                    >
                      Mobile
                    </Label>
                    <Input
                      id={`visit-new-contact-${String(index)}-mobile`}
                      type="tel"
                      inputMode="tel"
                      autoComplete="off"
                      {...form.register(`newContacts.${index}.mobile`)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="sm:mt-6"
                    aria-label={`Remove new Contact ${String(index + 1)}`}
                    onClick={() => {
                      extra.remove(index);
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {canAddContacts && extra.fields.length < newContactLimit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                extra.append({ name: "", jobTitle: "", mobile: "" });
              }}
            >
              <Plus aria-hidden="true" />
              Add a Contact
            </Button>
          )}
          {canAddContacts && extra.fields.length > 0 && (
            <p className="text-muted-foreground text-xs">
              New Contacts join the company&apos;s Contacts when you save.
            </p>
          )}
        </div>
        <div className="min-w-0 space-y-1.5 sm:col-span-2">
          <Label htmlFor="visit-visitors" required>
            Visited by
          </Label>
          <Controller
            control={form.control}
            name="visitorIds"
            render={({ field: control }) => (
              <ChipsSelect
                id="visit-visitors"
                label="Marketing People"
                options={people}
                value={control.value}
                onChange={(ids) => {
                  control.onChange(withSelf(ids));
                }}
                invalid={errors.visitorIds != null}
                required
                placeholder="Choose Marketing People"
                emptyText="No Marketing Person matches"
              />
            )}
          />
          {keepSelf && (
            <p className="text-muted-foreground text-xs">
              You stay on the Visit: your Role shows you only the Visits you are
              on.
            </p>
          )}
          <FieldError message={errors.visitorIds?.message} />
        </div>
      </section>

      <section
        aria-labelledby="visit-details-heading"
        className="bg-card grid min-w-0 gap-4 rounded-xl border p-4 sm:grid-cols-2 sm:p-5"
      >
        <h2 id="visit-details-heading" className="font-semibold sm:col-span-2">
          Visit
        </h2>
        <fieldset className="min-w-0 space-y-1.5 sm:col-span-2">
          <legend className="text-sm leading-none font-medium">
            Date and time
            {timeLocked ? null : <RequiredIndicator />}
          </legend>
          <div className="mt-1.5 grid max-w-sm grid-cols-[1fr_7rem] gap-2">
            <Input
              type="date"
              aria-label="Visit date"
              aria-required
              readOnly={timeLocked}
              disabled={timeLocked}
              max={completing ? zoneFields(now, timeZone).date : undefined}
              aria-invalid={errors.date != null}
              {...form.register("date")}
            />
            <Input
              type="time"
              aria-label="Visit time"
              aria-required
              readOnly={timeLocked}
              disabled={timeLocked}
              aria-invalid={errors.time != null}
              {...form.register("time")}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            {timeLocked
              ? "To change the time, Reschedule the Visit from its page."
              : `In the Company time zone (${timeZone}).`}
          </p>
          <FieldError message={errors.date?.message ?? errors.time?.message} />
        </fieldset>
        {field(
          "visit-purpose",
          "Purpose",
          selectField("purpose", "visit-purpose", PURPOSE_ITEMS, "Not set"),
        )}
        {field(
          "visit-interest",
          "Interest",
          selectField("interest", "visit-interest", INTEREST_ITEMS, "Not set"),
        )}
        {field(
          "visit-location",
          "Location",
          <Input
            id="visit-location"
            autoComplete="off"
            placeholder={
              picked?.address ?? "The company's address, unless you say"
            }
            aria-invalid={errors.location != null}
            {...form.register("location")}
          />,
          { className: "sm:col-span-2", message: errors.location?.message },
        )}
        {field(
          "visit-discussion",
          "Discussion",
          <Textarea
            id="visit-discussion"
            rows={4}
            placeholder="What was said, what they need"
            aria-required={completing || undefined}
            aria-invalid={errors.discussion != null}
            {...form.register("discussion")}
          />,
          {
            required: completing,
            className: "sm:col-span-2",
            message: errors.discussion?.message,
          },
        )}
        {field(
          "visit-outcome",
          "Outcome",
          <Input
            id="visit-outcome"
            autoComplete="off"
            placeholder="Asked for a quotation"
            aria-invalid={errors.outcome != null}
            {...form.register("outcome")}
          />,
          { className: "sm:col-span-2", message: errors.outcome?.message },
        )}
      </section>

      <section
        aria-labelledby="visit-requirement-heading"
        className="bg-card grid min-w-0 gap-4 rounded-xl border p-4 sm:grid-cols-3 sm:p-5"
      >
        <div className="space-y-1 sm:col-span-3">
          <h2 id="visit-requirement-heading" className="font-semibold">
            Requirement
          </h2>
          <p className="text-muted-foreground text-sm">
            Optional. The work they may give, as far as you know.
          </p>
        </div>
        {field(
          "visit-work-type",
          "Type of work",
          selectField(
            "requirementWorkType",
            "visit-work-type",
            WORK_TYPE_ITEMS,
            "Not known",
          ),
        )}
        {field(
          "visit-value",
          "Approximate value",
          <MoneyInput
            id="visit-value"
            placeholder="25,00,000"
            aria-invalid={errors.requirementValue != null}
            {...form.register("requirementValue")}
          />,
          { message: errors.requirementValue?.message },
        )}
        {field(
          "visit-start-month",
          "Expected start",
          <Input
            id="visit-start-month"
            type="month"
            aria-invalid={errors.requirementStartMonth != null}
            {...form.register("requirementStartMonth")}
          />,
          { message: errors.requirementStartMonth?.message },
        )}
      </section>

      {followUpShown && (
        <section
          aria-labelledby="visit-follow-up-heading"
          className="bg-card grid min-w-0 gap-4 rounded-xl border p-4 sm:grid-cols-2 sm:p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-2 sm:col-span-2">
            <div className="space-y-1">
              <h2 id="visit-follow-up-heading" className="font-semibold">
                Next Follow-up
              </h2>
              <p className="text-muted-foreground text-sm">
                Optional. What is owed next; saving adds it to Follow-ups.
              </p>
            </div>
            <Button
              type="button"
              variant={followUpOn ? "ghost" : "outline"}
              size="sm"
              onClick={() => {
                form.setValue("nextFollowUp.enabled", !followUpOn);
                form.clearErrors("nextFollowUp");
              }}
            >
              {followUpOn ? (
                <>
                  <Trash2 aria-hidden="true" />
                  Remove Next Follow-up
                </>
              ) : (
                <>
                  <CalendarClock aria-hidden="true" />
                  Add Next Follow-up
                </>
              )}
            </Button>
          </div>
          {followUpOn && (
            <>
              {field(
                "visit-follow-up-type",
                "Type",
                <Controller
                  control={form.control}
                  name="nextFollowUp.type"
                  render={({ field: control }) => (
                    <CompanySelect
                      id="visit-follow-up-type"
                      required
                      value={control.value}
                      onChange={control.onChange}
                      items={FOLLOW_UP_TYPE_ITEMS}
                      placeholder="Choose the type"
                      invalid={errors.nextFollowUp?.type != null}
                    />
                  )}
                />,
                { required: true, message: errors.nextFollowUp?.type?.message },
              )}
              {field(
                "visit-follow-up-due",
                "Due date",
                <Input
                  id="visit-follow-up-due"
                  type="date"
                  aria-required
                  aria-invalid={errors.nextFollowUp?.dueDate != null}
                  {...form.register("nextFollowUp.dueDate")}
                />,
                {
                  required: true,
                  message: errors.nextFollowUp?.dueDate?.message,
                },
              )}
              {field(
                "visit-follow-up-owner",
                "Owner",
                <Controller
                  control={form.control}
                  name="nextFollowUp.ownerMemberId"
                  render={({ field: control }) => (
                    <CompanySelect
                      id="visit-follow-up-owner"
                      value={control.value}
                      onChange={control.onChange}
                      items={owners}
                      placeholder="You"
                      invalid={errors.nextFollowUp?.ownerMemberId != null}
                    />
                  )}
                />,
                {
                  className: "sm:col-span-2",
                  message: errors.nextFollowUp?.ownerMemberId?.message,
                },
              )}
              {field(
                "visit-follow-up-note",
                "Note",
                <Textarea
                  id="visit-follow-up-note"
                  rows={2}
                  placeholder="Send the PEB warehouse rates"
                  aria-invalid={errors.nextFollowUp?.note != null}
                  {...form.register("nextFollowUp.note")}
                />,
                {
                  className: "sm:col-span-2",
                  message: errors.nextFollowUp?.note?.message,
                },
              )}
            </>
          )}
        </section>
      )}

      <FormAlert message={error ?? undefined} />
      <div className="flex flex-wrap justify-end gap-2">
        <Link
          href={visit == null ? visitPath() : visitPath(visit.id)}
          className={buttonVariants({ variant: "outline" })}
        >
          Cancel
        </Link>
        <Button type="submit" disabled={busy}>
          {busy
            ? "Saving…"
            : mode.kind === "complete"
              ? "Complete Visit"
              : "Save"}
        </Button>
      </div>
    </form>
  );
}
