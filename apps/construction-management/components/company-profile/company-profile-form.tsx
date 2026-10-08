"use client";

import { normalizeMobile } from "@repo/auth/construction/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { Separator } from "@repo/ui/components/separator";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { MobileField } from "@/components/auth/mobile-field";
import { ImageUploader } from "@/components/profile/image-uploader";
import { fieldForCode } from "@/lib/server-errors";
import {
  CURRENCIES,
  TIMEZONES,
  countryByCode,
} from "@/src/organization/domain/countries";
import {
  companyProfileQuery,
  removeCompanyLogo,
  updateCompanyProfile,
  uploadCompanyLogo,
  type CompanyProfileModel,
} from "@/src/queries/company-profile";
import { myCompaniesQuery } from "@/src/queries/companies";
import { isValidGstin, isValidPan } from "@/src/shared-kernel/tax-ids";

const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Why a GSTIN is wrong, as specifically as we can tell. */
export function gstinProblem(value: string): string | null {
  if (value === "" || isValidGstin(value)) return null;
  if (!GSTIN_SHAPE.test(value)) return "Enter a valid 15-character GSTIN";
  const state = Number(value.slice(0, 2));
  if (state < 1 || state > 38)
    return "The GSTIN must start with a state code from 01 to 38";
  if (!isValidPan(value.slice(2, 12)))
    return "Characters 3 to 12 of the GSTIN must be a valid PAN";
  return "The GSTIN's last character does not match its checksum. Check it for a typo";
}

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
        message: "Enter a valid mobile number",
      }),
    email: z
      .string()
      .trim()
      .refine((value) => value === "" || z.email().safeParse(value).success, {
        message: "Enter a valid email address",
      }),
    gstin: z.string().trim().toUpperCase(),
    pan: z
      .string()
      .trim()
      .toUpperCase()
      .refine((value) => value === "" || isValidPan(value), {
        message: "Enter a valid 10-character PAN, like AAPFU0939F",
      }),
    address: z.string().trim().max(500, "Use at most 500 characters"),
    currency: z.string().length(3),
    timezone: z.string().min(1),
  })
  .superRefine((values, context) => {
    const problem = gstinProblem(values.gstin);
    if (problem != null) {
      context.addIssue({ code: "custom", path: ["gstin"], message: problem });
      return;
    }
    if (
      values.gstin !== "" &&
      values.pan !== "" &&
      values.gstin.slice(2, 12) !== values.pan
    )
      context.addIssue({
        code: "custom",
        path: ["gstin"],
        message: "The GSTIN must contain the Company PAN",
      });
  });

type Values = z.input<typeof schema>;
type Parsed = z.output<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  COMPANY_NAME_REQUIRED: "name",
  COMPANY_NAME_TOO_LONG: "name",
  MOBILE_INVALID: "mobile",
  EMAIL_INVALID: "email",
  CURRENCY_INVALID: "currency",
  TIMEZONE_INVALID: "timezone",
  GSTIN_INVALID: "gstin",
  GSTIN_PAN_MISMATCH: "gstin",
  PAN_INVALID: "pan",
  ADDRESS_TOO_LONG: "address",
};

const CURRENCY_ITEMS = CURRENCIES.map((code) => ({ value: code, label: code }));
const TIMEZONE_ITEMS = TIMEZONES.map((zone) => ({
  value: zone,
  label: zone.replace(/_/g, " "),
}));

function valuesOf(profile: CompanyProfileModel): Values {
  const mobile = profile.mobile ?? "";
  return {
    name: profile.name,
    mobile:
      profile.isIndian && mobile.startsWith("+91") ? mobile.slice(3) : mobile,
    email: profile.email ?? "",
    gstin: profile.gstin ?? "",
    pan: profile.pan ?? "",
    address: profile.address ?? "",
    currency: profile.currency,
    timezone: profile.timezone,
  };
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

/**
 * The Company profile (CM-115): logo, name, contact, GSTIN and PAN, address,
 * currency and time zone. Read-only without Settings update.
 */
export function CompanyProfileForm({
  profile,
}: {
  profile: CompanyProfileModel;
}) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const form = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf(profile),
  });
  const mutation = useMutation({ mutationFn: updateCompanyProfile });
  const readOnly = !profile.canUpdate;
  const country = countryByCode(profile.country);
  const errors = form.formState.errors;

  const accept = (updated: CompanyProfileModel) => {
    queryClient.setQueryData(companyProfileQuery.queryKey, updated);
  };

  const submit = async (values: Parsed) => {
    setSaved(false);
    try {
      const updated = await mutation.mutateAsync({
        name: values.name,
        mobile: values.mobile === "" ? null : normalizeMobile(values.mobile),
        email: values.email === "" ? null : values.email,
        gstin: profile.isIndian && values.gstin !== "" ? values.gstin : null,
        pan: profile.isIndian && values.pan !== "" ? values.pan : null,
        address: values.address === "" ? null : values.address,
        currency: values.currency,
        timezone: values.timezone,
        expectedUpdatedAt: profile.updatedAt,
      });
      accept(updated);
      form.reset(valuesOf(updated));
      setSaved(true);
      // The switcher shows the Company name.
      await queryClient.invalidateQueries({
        queryKey: myCompaniesQuery.queryKey,
      });
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  };

  return (
    <div className="space-y-8">
      <section aria-labelledby="company-logo-heading" className="space-y-3">
        <div>
          <h2 id="company-logo-heading" className="text-base font-semibold">
            Logo
          </h2>
          <p className="text-muted-foreground text-sm">
            Printed on your Purchase Orders, invoices and reports.
          </p>
        </div>
        <ImageUploader
          kind="company_logo"
          noun="logo"
          shape="square"
          imageUrl={profile.logoUrl}
          fallback={
            profile.name.trim() === "" ? (
              <Building aria-hidden="true" />
            ) : (
              initials(profile.name)
            )
          }
          hint="PNG, JPEG or WebP, up to 2 MB. A square logo prints best."
          disabled={readOnly}
          onUpload={async (file) => {
            accept(await uploadCompanyLogo(file));
          }}
          onRemove={async () => {
            accept(await removeCompanyLogo());
          }}
        />
      </section>

      <Separator />

      <form
        onSubmit={(event) => {
          void form.handleSubmit(submit)(event);
        }}
        noValidate
        aria-label="Company profile"
      >
        <fieldset disabled={readOnly} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="company-name">Company name</Label>
              <Input
                id="company-name"
                className="h-10"
                {...form.register("name")}
              />
              <FieldError message={errors.name?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company-mobile">Company mobile</Label>
              {profile.isIndian ? (
                <MobileField id="company-mobile" {...form.register("mobile")} />
              ) : (
                <Input
                  id="company-mobile"
                  type="tel"
                  inputMode="tel"
                  placeholder="+971 50 123 4567"
                  className="h-10"
                  {...form.register("mobile")}
                />
              )}
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
          </div>

          {profile.isIndian && (
            <div className="grid gap-4 md:grid-cols-2">
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

          <div className="space-y-1.5">
            <Label htmlFor="company-address">Address</Label>
            <Textarea
              id="company-address"
              rows={3}
              placeholder="Office address, as it should print on documents"
              {...form.register("address")}
            />
            <FieldError message={errors.address?.message} />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="company-country">Country</Label>
              <Input
                id="company-country"
                readOnly
                disabled
                value={country?.name ?? profile.country}
                aria-describedby="company-country-note"
                className="h-10"
              />
              <p
                id="company-country-note"
                className="text-muted-foreground text-xs"
              >
                Set when the Company was created; it decides GST and plans.
              </p>
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
                    disabled={readOnly}
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
              <FieldError message={errors.currency?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company-timezone">Time zone</Label>
              <Controller
                name="timezone"
                control={form.control}
                render={({ field }) => (
                  <Select
                    items={TIMEZONE_ITEMS}
                    value={field.value}
                    disabled={readOnly}
                    onValueChange={(value) => {
                      if (value != null) field.onChange(value);
                    }}
                  >
                    <SelectTrigger
                      id="company-timezone"
                      size="lg"
                      className="w-full min-w-0"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                      align="start"
                      alignItemWithTrigger={false}
                      aria-label="Time zones"
                    >
                      {TIMEZONE_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError message={errors.timezone?.message} />
            </div>
          </div>

          <FormAlert message={errors.root?.message} />

          {readOnly ? (
            <p className="text-muted-foreground text-sm">
              Only the Owner, or a Team Member allowed to change Settings, can
              edit the Company profile.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                className="h-10"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Saving…" : "Save changes"}
              </Button>
              {saved && !form.formState.isDirty && (
                <p role="status" className="text-muted-foreground text-sm">
                  Company profile saved.
                </p>
              )}
            </div>
          )}
        </fieldset>
      </form>
    </div>
  );
}
