"use client";

import {
  navigateInApp,
  normalizeMobile,
  useCompanyUser,
} from "@repo/auth/construction/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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

import { AuthHeading } from "@/components/auth/auth-heading";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { MobileField } from "@/components/auth/mobile-field";
import { fieldForCode } from "@/lib/server-errors";
import { createCompany } from "@/src/queries/companies";
import {
  COUNTRIES,
  CURRENCIES,
  countryByCode,
} from "@/src/organization/domain/countries";
import { isValidGstin, isValidPan } from "@/src/shared-kernel/tax-ids";

const schema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter the Company name")
      .max(120, "Use at most 120 characters"),
    mobile: z
      .string()
      .trim()
      .refine((value) => value === "" || normalizeMobile(value) != null, {
        message: "Enter a valid 10-digit mobile number",
      }),
    email: z
      .string()
      .trim()
      .refine((value) => value === "" || z.email().safeParse(value).success, {
        message: "Enter a valid email address",
      }),
    country: z.string().length(2),
    currency: z.string().length(3),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .refine((value) => value === "" || isValidGstin(value), {
        message: "Enter a valid 15-character GSTIN",
      }),
    pan: z
      .string()
      .trim()
      .toUpperCase()
      .refine((value) => value === "" || isValidPan(value), {
        message: "Enter a valid 10-character PAN",
      }),
  })
  .refine(
    (values) =>
      values.gstin === "" ||
      values.pan === "" ||
      values.gstin.slice(2, 12) === values.pan,
    { path: ["gstin"], message: "The GSTIN must contain the Company PAN" },
  );

type Values = z.infer<typeof schema>;

const STEPS = [
  { title: "Your Company", fields: ["name"] },
  { title: "Contact", fields: ["mobile", "email"] },
  { title: "Country and tax", fields: ["country", "currency", "gstin", "pan"] },
] as const satisfies readonly { title: string; fields: (keyof Values)[] }[];

const SERVER_FIELDS: Record<string, keyof Values> = {
  COMPANY_NAME_REQUIRED: "name",
  COMPANY_NAME_TOO_LONG: "name",
  MOBILE_INVALID: "mobile",
  EMAIL_INVALID: "email",
  COUNTRY_INVALID: "country",
  CURRENCY_INVALID: "currency",
  GSTIN_INVALID: "gstin",
  GSTIN_PAN_MISMATCH: "gstin",
  PAN_INVALID: "pan",
};

const COUNTRY_ITEMS = COUNTRIES.map((country) => ({
  value: country.code,
  label: country.name,
}));
const CURRENCY_ITEMS = CURRENCIES.map((currency) => ({
  value: currency,
  label: currency,
}));

/** The first-run wizard (CM-105): name → contact → country and tax → done. */
export function CreateCompanyWizard() {
  const { user } = useCompanyUser();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<{ name: string } | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      mobile: user?.phoneNumber?.replace(/^\+91/, "") ?? "",
      email:
        user?.emailVerified === true && !user.email.endsWith(".invalid")
          ? user.email
          : "",
      country: "IN",
      currency: "INR",
      gstin: "",
      pan: "",
    },
  });
  const mutation = useMutation({ mutationFn: createCompany });
  const country = useWatch({ control: form.control, name: "country" });
  const isIndia = country === "IN";

  const next = async () => {
    const current = STEPS[step];
    if (current == null) return;
    if (await form.trigger([...current.fields])) setStep(step + 1);
  };

  const submit = async (values: Values) => {
    try {
      const created = await mutation.mutateAsync({
        name: values.name,
        mobile: values.mobile === "" ? null : normalizeMobile(values.mobile),
        email: values.email === "" ? null : values.email,
        country: values.country,
        currency: values.currency,
        gstin: isIndia && values.gstin !== "" ? values.gstin : null,
        pan: isIndia && values.pan !== "" ? values.pan : null,
      });
      setDone({ name: created.name });
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      if (field == null) {
        form.setError("root", { message });
        return;
      }
      form.setError(field, { message });
      const fieldStep = STEPS.findIndex((candidate) =>
        (candidate.fields as readonly string[]).includes(field),
      );
      if (fieldStep >= 0) setStep(fieldStep);
    }
  };

  if (done != null) {
    return (
      <div className="space-y-6 text-center">
        <CheckCircle2
          aria-hidden="true"
          className="text-primary mx-auto size-12"
        />
        <AuthHeading
          title={`${done.name} is ready`}
          description="You are its Owner. Add your first Project to get started."
        />
        <Button
          className="h-10 w-full"
          onClick={() => {
            navigateInApp("/app/projects");
          }}
        >
          Open Projects
        </Button>
      </div>
    );
  }

  const errors = form.formState.errors;
  const current = STEPS[step] ?? STEPS[0];
  const last = step === STEPS.length - 1;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
          Step {step + 1} of {STEPS.length}
        </p>
        <AuthHeading
          title={current.title}
          description={
            step === 0
              ? "Create the Company your team will work in. You can add more later."
              : step === 1
                ? "How your team and suppliers reach the Company. Both are optional."
                : "GSTIN and PAN print on your documents. Both are optional."
          }
        />
        <div className="flex gap-1.5" aria-hidden="true">
          {STEPS.map((item, index) => (
            <span
              key={item.title}
              className={`h-1 flex-1 rounded-full ${index <= step ? "bg-primary" : "bg-border"}`}
            />
          ))}
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (last) void form.handleSubmit(submit)(event);
          else void next();
        }}
        className="space-y-4"
        noValidate
      >
        {step === 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="company-name">Company name</Label>
            <Input
              id="company-name"
              autoFocus
              placeholder="Patil Builders"
              className="h-10"
              {...form.register("name")}
            />
            <FieldError message={errors.name?.message} />
          </div>
        )}

        {step === 1 && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="company-mobile">Company mobile</Label>
              <MobileField id="company-mobile" {...form.register("mobile")} />
              <FieldError message={errors.mobile?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company-email">Company email</Label>
              <Input
                id="company-email"
                type="email"
                placeholder="office@patilbuilders.in"
                className="h-10"
                {...form.register("email")}
              />
              <FieldError message={errors.email?.message} />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <div className="space-y-1.5">
                <Label htmlFor="company-country">Country</Label>
                <Controller
                  name="country"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      items={COUNTRY_ITEMS}
                      value={field.value}
                      onValueChange={(value) => {
                        if (value == null) return;
                        field.onChange(value);
                        const picked = countryByCode(value);
                        if (picked != null)
                          form.setValue("currency", picked.currency);
                      }}
                    >
                      <SelectTrigger
                        id="company-country"
                        size="lg"
                        className="w-full min-w-0"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent
                        align="start"
                        alignItemWithTrigger={false}
                        aria-label="Countries"
                      >
                        {COUNTRY_ITEMS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError message={errors.country?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company-currency">Currency</Label>
                <Controller
                  name="currency"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      items={CURRENCY_ITEMS}
                      value={field.value}
                      onValueChange={(value) => {
                        if (value != null) field.onChange(value);
                      }}
                    >
                      <SelectTrigger
                        id="company-currency"
                        size="lg"
                        className="w-full min-w-0"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent
                        align="start"
                        alignItemWithTrigger={false}
                        aria-label="Currencies"
                      >
                        {CURRENCY_ITEMS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
            {isIndia && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="company-gstin">GSTIN</Label>
                  <Input
                    id="company-gstin"
                    placeholder="27AAPFU0939F1ZV"
                    autoCapitalize="characters"
                    className="h-10 uppercase placeholder:normal-case"
                    {...form.register("gstin")}
                  />
                  <FieldError message={errors.gstin?.message} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company-pan">Company PAN</Label>
                  <Input
                    id="company-pan"
                    placeholder="AAPFU0939F"
                    autoCapitalize="characters"
                    className="h-10 uppercase placeholder:normal-case"
                    {...form.register("pan")}
                  />
                  <FieldError message={errors.pan?.message} />
                </div>
              </div>
            )}
          </>
        )}

        <FormAlert message={errors.root?.message} />

        <div className="flex gap-3 pt-2">
          {step > 0 && (
            <Button
              type="button"
              variant="outline"
              className="h-10 flex-1"
              onClick={() => {
                setStep(step - 1);
              }}
            >
              Back
            </Button>
          )}
          <Button
            type="submit"
            className="h-10 flex-1"
            disabled={mutation.isPending}
          >
            {last
              ? mutation.isPending
                ? "Creating…"
                : "Create Company"
              : "Continue"}
          </Button>
        </div>
      </form>
    </div>
  );
}
