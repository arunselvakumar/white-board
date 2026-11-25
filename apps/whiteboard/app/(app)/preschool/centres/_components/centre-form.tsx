"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Controller,
  useForm,
  useWatch,
  type Control,
  type FieldErrors,
  type FieldValues,
  type UseFormRegister,
  type UseFormSetError,
} from "react-hook-form";
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
import { Switch } from "@repo/ui/components/switch";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { applyHttpFormError } from "@/lib/apply-http-form-error";
import { QueryHttpError } from "@/src/queries/http";
import type {
  PreschoolCentre,
  PreschoolCentreCreateInput,
  PreschoolCentreDetailsInput,
  PreschoolCentreFranchiseInput,
} from "@/src/queries/preschool/centres";

export const OWNERSHIP_OPTIONS = [
  { value: "company_owned", label: "Company-owned" },
  { value: "franchised", label: "Franchised" },
] as const;

export const OWNERSHIP_LABEL = {
  company_owned: "Company-owned",
  franchised: "Franchised",
} as const;

const optionalEmail = z
  .string()
  .trim()
  .max(320)
  .refine(
    (value) => value === "" || z.email().safeParse(value).success,
    "Enter a valid email",
  );

const detailsShape = {
  name: z.string().trim().min(1, "Centre name is required").max(200),
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{2,6}$/, "Use 2 to 6 letters or digits"),
  phone: z.string().trim().max(32),
  email: optionalEmail,
  addressLine: z.string().trim().max(300),
  city: z.string().trim().max(100),
  state: z.string().trim().max(100),
  pincode: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^[1-9]\d{5}$/.test(value),
      "A PIN code is 6 digits",
    ),
};

const ownershipShape = {
  ownership: z.enum(["company_owned", "franchised"]),
  franchiseeName: z.string().trim().max(200),
  franchiseePhone: z.string().trim().max(32),
  franchiseeEmail: optionalEmail,
  agreementStartOn: z.string(),
  agreementEndOn: z.string(),
  /** Text as typed: up to two decimals, 0–100. */
  royaltyPercent: z.string().trim(),
  mayOverrideFees: z.boolean(),
};

type OwnershipValues = {
  ownership: "company_owned" | "franchised";
  franchiseeName: string;
  agreementStartOn: string;
  agreementEndOn: string;
  royaltyPercent: string;
};

function checkOwnership(value: OwnershipValues, ctx: z.RefinementCtx): void {
  if (value.ownership !== "franchised") return;
  if (value.franchiseeName === "")
    ctx.addIssue({
      code: "custom",
      path: ["franchiseeName"],
      message: "A Franchised Centre needs the franchisee's name",
    });
  if (
    value.royaltyPercent !== "" &&
    (!/^\d{1,3}(?:\.\d{1,2})?$/.test(value.royaltyPercent) ||
      Number(value.royaltyPercent) > 100)
  )
    ctx.addIssue({
      code: "custom",
      path: ["royaltyPercent"],
      message: "Enter 0 to 100, with at most two decimals",
    });
  if (
    value.agreementStartOn !== "" &&
    value.agreementEndOn !== "" &&
    value.agreementEndOn < value.agreementStartOn
  )
    ctx.addIssue({
      code: "custom",
      path: ["agreementEndOn"],
      message: "The agreement cannot end before it starts",
    });
}

const detailsSchema = z.object(detailsShape);
const ownershipSchema = z.object(ownershipShape).superRefine(checkOwnership);
const createSchema = z
  .object({ ...detailsShape, ...ownershipShape })
  .superRefine(checkOwnership);

export type CentreDetailsValues = z.infer<typeof detailsSchema>;
export type CentreOwnershipValues = z.infer<typeof ownershipSchema>;
type CentreCreateValues = z.infer<typeof createSchema>;

const EMPTY_DETAILS: CentreDetailsValues = {
  name: "",
  code: "",
  phone: "",
  email: "",
  addressLine: "",
  city: "",
  state: "",
  pincode: "",
};

const EMPTY_OWNERSHIP: CentreOwnershipValues = {
  ownership: "company_owned",
  franchiseeName: "",
  franchiseePhone: "",
  franchiseeEmail: "",
  agreementStartOn: "",
  agreementEndOn: "",
  royaltyPercent: "",
  mayOverrideFees: true,
};

export function centreToDetailsValues(
  centre: PreschoolCentre,
): CentreDetailsValues {
  return {
    name: centre.name,
    code: centre.code,
    phone: centre.phone ?? "",
    email: centre.email ?? "",
    addressLine: centre.addressLine ?? "",
    city: centre.city ?? "",
    state: centre.state ?? "",
    pincode: centre.pincode ?? "",
  };
}

export function centreToOwnershipValues(
  centre: PreschoolCentre,
): CentreOwnershipValues {
  return {
    ownership: centre.ownership,
    franchiseeName: centre.franchiseeName ?? "",
    franchiseePhone: centre.franchiseePhone ?? "",
    franchiseeEmail: centre.franchiseeEmail ?? "",
    agreementStartOn: centre.agreementStartOn ?? "",
    agreementEndOn: centre.agreementEndOn ?? "",
    royaltyPercent:
      centre.ownership === "franchised" ? String(centre.royaltyPercent) : "",
    mayOverrideFees: centre.mayOverrideFees,
  };
}

const orNull = (value: string) => (value === "" ? null : value);

function detailsInput(
  values: CentreDetailsValues,
): PreschoolCentreDetailsInput {
  return {
    name: values.name,
    code: values.code.toUpperCase(),
    phone: orNull(values.phone),
    email: orNull(values.email),
    addressLine: orNull(values.addressLine),
    city: orNull(values.city),
    state: orNull(values.state),
    pincode: orNull(values.pincode),
  };
}

function ownershipInput(
  values: CentreOwnershipValues,
): PreschoolCentreFranchiseInput {
  if (values.ownership === "company_owned")
    return {
      ownership: "company_owned",
      mayOverrideFees: values.mayOverrideFees,
    };
  return {
    ownership: "franchised",
    franchiseeName: values.franchiseeName,
    franchiseePhone: orNull(values.franchiseePhone),
    franchiseeEmail: orNull(values.franchiseeEmail),
    agreementStartOn: orNull(values.agreementStartOn),
    agreementEndOn: orNull(values.agreementEndOn),
    royaltyPercent:
      values.royaltyPercent === "" ? 0 : Number(values.royaltyPercent),
    mayOverrideFees: values.mayOverrideFees,
  };
}

/** Server rules a field can show; anything else goes to the form's alert. */
const FIELD_BY_CODE = {
  CENTRE_CODE_IN_USE: "code",
  CENTRE_CODE_INVALID: "code",
  PINCODE_INVALID: "pincode",
  FRANCHISEE_NAME_REQUIRED: "franchiseeName",
  ROYALTY_INVALID: "royaltyPercent",
  AGREEMENT_DATES_INVALID: "agreementEndOn",
} as const;

function applyCentreError<Values extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<Values>,
  fields: readonly string[],
): void {
  if (error instanceof QueryHttpError && error.code in FIELD_BY_CODE) {
    const field = FIELD_BY_CODE[error.code as keyof typeof FIELD_BY_CODE];
    if (fields.includes(field)) {
      setError(field as Parameters<typeof setError>[0], {
        message: error.message,
      });
      return;
    }
  }
  applyHttpFormError(
    error,
    setError,
    "Could not save this Centre. Please try again.",
  );
}

type TextField = {
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  inputMode?: "numeric" | "decimal" | "tel" | "email";
  type?: "date" | "email" | "tel";
  autoComplete?: string;
};

function TextFields<Values extends FieldValues>({
  fields,
  register,
  errors,
}: {
  fields: readonly TextField[];
  register: UseFormRegister<Values>;
  errors: FieldErrors<Values>;
}) {
  return fields.map((field) => {
    const message = errors[field.name]?.message;
    return (
      <div key={field.name} className="space-y-1.5">
        <Label htmlFor={`centre-${field.name}`} required={field.required}>
          {field.label}
        </Label>
        <Input
          id={`centre-${field.name}`}
          className="h-10"
          aria-required={field.required}
          aria-invalid={message != null}
          placeholder={field.placeholder}
          inputMode={field.inputMode}
          type={field.type}
          autoComplete={field.autoComplete ?? "off"}
          {...register(field.name as Parameters<typeof register>[0])}
        />
        {field.hint == null ? null : (
          <p className="text-muted-foreground text-xs">{field.hint}</p>
        )}
        <FieldError
          message={typeof message === "string" ? message : undefined}
        />
      </div>
    );
  });
}

const NAME_FIELDS: readonly TextField[] = [
  {
    name: "name",
    label: "Centre name",
    required: true,
    placeholder: "Little Steps Anna Nagar",
  },
  {
    name: "code",
    label: "Centre code",
    required: true,
    placeholder: "LSAN",
    hint: "2 to 6 letters or digits. Admission and Receipt numbers start with it.",
  },
];
const CONTACT_FIELDS: readonly TextField[] = [
  { name: "phone", label: "Phone", type: "tel", inputMode: "tel" },
  { name: "email", label: "Email", type: "email", inputMode: "email" },
];
const ADDRESS_FIELDS: readonly TextField[] = [
  { name: "city", label: "City" },
  { name: "state", label: "State" },
  { name: "pincode", label: "PIN code", inputMode: "numeric" },
];
const FRANCHISEE_FIELDS: readonly TextField[] = [
  { name: "franchiseePhone", label: "Franchisee phone", type: "tel" },
  { name: "franchiseeEmail", label: "Franchisee email", type: "email" },
];
const AGREEMENT_FIELDS: readonly TextField[] = [
  { name: "agreementStartOn", label: "Agreement starts", type: "date" },
  { name: "agreementEndOn", label: "Agreement ends", type: "date" },
  {
    name: "royaltyPercent",
    label: "Royalty (%)",
    inputMode: "decimal",
    placeholder: "10",
    hint: "On collections of royalty-bearing Fee Heads.",
  },
];

function DetailsFields<Values extends FieldValues>({
  register,
  errors,
}: {
  register: UseFormRegister<Values>;
  errors: FieldErrors<Values>;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <TextFields fields={NAME_FIELDS} register={register} errors={errors} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextFields
          fields={CONTACT_FIELDS}
          register={register}
          errors={errors}
        />
      </div>
      <TextFields
        fields={[{ name: "addressLine", label: "Address" }]}
        register={register}
        errors={errors}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextFields
          fields={ADDRESS_FIELDS}
          register={register}
          errors={errors}
        />
      </div>
    </div>
  );
}

type OwnershipFormValues = CentreOwnershipValues | CentreCreateValues;

function OwnershipFields({
  control,
  register,
  errors,
}: {
  control: Control<OwnershipFormValues>;
  register: UseFormRegister<OwnershipFormValues>;
  errors: FieldErrors<OwnershipFormValues>;
}) {
  const ownership = useWatch({ control, name: "ownership" });
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="centre-ownership" required>
          Ownership
        </Label>
        <Controller
          name="ownership"
          control={control}
          render={({ field }) => (
            <Select
              items={OWNERSHIP_OPTIONS}
              value={field.value}
              onValueChange={(value) => {
                if (value != null) field.onChange(value);
              }}
            >
              <SelectTrigger
                id="centre-ownership"
                size="lg"
                aria-required
                className="w-full min-w-0 sm:w-64"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                {OWNERSHIP_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
      {ownership === "franchised" ? (
        <>
          <TextFields
            fields={[
              {
                name: "franchiseeName",
                label: "Franchisee name",
                required: true,
              },
            ]}
            register={register}
            errors={errors}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextFields
              fields={FRANCHISEE_FIELDS}
              register={register}
              errors={errors}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextFields
              fields={AGREEMENT_FIELDS}
              register={register}
              errors={errors}
            />
          </div>
        </>
      ) : null}
      <Controller
        name="mayOverrideFees"
        control={control}
        render={({ field }) => (
          <div className="flex items-start gap-3">
            <Switch
              id="centre-mayOverrideFees"
              checked={field.value}
              onCheckedChange={(checked) => {
                field.onChange(checked);
              }}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="centre-mayOverrideFees">
                May change fee amounts
              </Label>
              <p className="text-muted-foreground text-xs">
                The Centre can override the Head Office Fee Structure.
              </p>
            </div>
          </div>
        )}
      />
    </div>
  );
}

function FormButtons({
  submitLabel,
  submitting,
  onCancel,
}: {
  submitLabel: string;
  submitting: boolean;
  onCancel?: () => void;
}) {
  return (
    <div className="flex gap-2">
      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : submitLabel}
      </Button>
      {onCancel == null ? null : (
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  );
}

/** Add Centre: details and ownership in one form. */
export function CentreForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: PreschoolCentreCreateInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CentreCreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { ...EMPTY_DETAILS, ...EMPTY_OWNERSHIP },
  });
  return (
    <form
      noValidate
      className="space-y-8"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onSubmit({
            ...detailsInput(values),
            ...ownershipInput(values),
          });
        } catch (error) {
          applyCentreError(error, setError, Object.keys(values));
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <section className="space-y-4" aria-labelledby="centre-details-heading">
        <h2 id="centre-details-heading" className="text-lg font-semibold">
          Centre details
        </h2>
        <DetailsFields register={register} errors={errors} />
      </section>
      <section className="space-y-4" aria-labelledby="centre-ownership-heading">
        <h2 id="centre-ownership-heading" className="text-lg font-semibold">
          Ownership and royalty
        </h2>
        <OwnershipFields
          control={control as unknown as Control<OwnershipFormValues>}
          register={register}
          errors={errors}
        />
      </section>
      <FormButtons
        submitLabel="Save Centre"
        submitting={isSubmitting}
        onCancel={onCancel}
      />
    </form>
  );
}

/** Edit a Centre's name, code and contact details. */
export function CentreDetailsForm({
  defaultValues,
  onSubmit,
  onCancel,
}: {
  defaultValues: CentreDetailsValues;
  onSubmit: (input: PreschoolCentreDetailsInput) => Promise<void>;
  onCancel: () => void;
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CentreDetailsValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues,
  });
  return (
    <form
      noValidate
      aria-label="Edit Centre details"
      className="space-y-6"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onSubmit(detailsInput(values));
        } catch (error) {
          applyCentreError(error, setError, Object.keys(values));
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <DetailsFields register={register} errors={errors} />
      <FormButtons
        submitLabel="Save details"
        submitting={isSubmitting}
        onCancel={onCancel}
      />
    </form>
  );
}

/** Edit how a Centre is owned: franchisee, agreement and royalty. */
export function CentreOwnershipForm({
  defaultValues,
  onSubmit,
  onCancel,
}: {
  defaultValues: CentreOwnershipValues;
  onSubmit: (input: PreschoolCentreFranchiseInput) => Promise<void>;
  onCancel: () => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CentreOwnershipValues>({
    resolver: zodResolver(ownershipSchema),
    defaultValues,
  });
  return (
    <form
      noValidate
      aria-label="Edit ownership and royalty"
      className="space-y-6"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onSubmit(ownershipInput(values));
        } catch (error) {
          applyCentreError(error, setError, Object.keys(values));
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <OwnershipFields
        control={control as Control<OwnershipFormValues>}
        register={register}
        errors={errors}
      />
      <FormButtons
        submitLabel="Save ownership"
        submitting={isSubmitting}
        onCancel={onCancel}
      />
    </form>
  );
}
