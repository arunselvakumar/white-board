"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, type ComponentProps, type ReactNode } from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type FieldPath,
} from "react-hook-form";
import { z } from "zod";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Input } from "@repo/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@repo/ui/components/input-group";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Switch } from "@repo/ui/components/switch";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import {
  isRupees,
  MoneyInput,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import { HRMS_PATH } from "@/lib/hrms-nav";
import {
  createSalaryStructure,
  type ComponentBasis,
  type SalaryStructure,
  type SalaryStructureInput,
} from "@/src/hrms/domain/salary-structure";
import { DomainError } from "@/src/shared-kernel/domain-error";
import {
  salaryStatutoryQuery,
  salaryStructureQuery,
  useCreateSalaryStructure,
  useUpdateSalaryStructure,
  type SalaryStatutoryModel,
  type SalaryStructureModel,
} from "@/src/queries/hrms-salary-setup";
import { QueryHttpError } from "@/src/queries/http";

import { SalarySample } from "./salary-sample";

export const SALARY_STRUCTURES_PATH = `${HRMS_PATH}/configuration/salary-structures`;

const PERCENT_RE = /^\d{1,3}(\.\d{1,2})?$/;

const BASIS_ITEMS: { value: ComponentBasis; label: string }[] = [
  { value: "percent_of_base", label: "% of base" },
  { value: "fixed", label: "Fixed amount" },
];

const componentSchema = z
  .object({
    id: z.string().nullable(),
    name: z.string().trim().min(1, "Enter the component's name").max(100),
    basis: z.enum(["fixed", "percent_of_base"]),
    amount: z.string(),
    percent: z.string(),
    isBalancing: z.boolean(),
    countsForPfWage: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.isBalancing) return;
    if (value.basis === "fixed" && !isRupees(value.amount))
      context.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Enter an amount in rupees",
      });
    if (value.basis === "percent_of_base" && !PERCENT_RE.test(value.percent))
      context.addIssue({
        code: "custom",
        path: ["percent"],
        message: "Enter a percentage, like 40 or 12.5",
      });
  });

const optionalPercent = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || PERCENT_RE.test(value),
    "Enter a percentage, or leave it empty",
  );

const optionalRupees = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || isRupees(value),
    "Enter an amount in rupees, or leave it empty",
  );

const schema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(100),
  description: z.string().max(500, "Use at most 500 characters"),
  isActive: z.boolean(),
  components: z.array(componentSchema).min(1, "Add at least one component"),
  pfApplicable: z.boolean(),
  pfEmployeePercent: optionalPercent,
  pfCapAtCeiling: z.boolean(),
  pfWageCeiling: optionalRupees,
  esiApplicable: z.boolean(),
  esiEmployeePercent: optionalPercent,
  ptApplicable: z.boolean(),
  ptMonthlyAmount: optionalRupees,
  deductAbsentDays: z.boolean(),
  deductUnpaidLeave: z.boolean(),
  otherDeductions: z.array(
    z.object({
      name: z.string().trim().min(1, "Enter the deduction's name").max(100),
      amount: z
        .string()
        .refine((value) => isRupees(value), "Enter an amount in rupees"),
    }),
  ),
});

type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, FieldPath<Values>> = {
  name: "name",
  description: "description",
  components: "components",
  "pf.employeePercent": "pfEmployeePercent",
  "pf.wageCeiling": "pfWageCeiling",
  "esi.employeePercent": "esiEmployeePercent",
  "pt.monthlyAmount": "ptMonthlyAmount",
  otherDeductions: "otherDeductions",
};

/** A server error's `details.field` as a form path (`components.2.percent` maps to itself). */
function serverField(error: unknown): FieldPath<Values> | null {
  if (!(error instanceof QueryHttpError)) return null;
  const details = error.details as { field?: unknown } | undefined;
  const field = typeof details?.field === "string" ? details.field : null;
  if (field == null) return null;
  if (/^(components|otherDeductions)\.\d+\.\w+$/.test(field))
    return field as FieldPath<Values>;
  return SERVER_FIELDS[field] ?? null;
}

function emptyComponent(
  overrides: Partial<Values["components"][number]> = {},
): Values["components"][number] {
  return {
    id: null,
    name: "",
    basis: "percent_of_base",
    amount: "",
    percent: "",
    isBalancing: false,
    countsForPfWage: false,
    ...overrides,
  };
}

const NEW_VALUES: Values = {
  name: "",
  description: "",
  isActive: true,
  components: [
    emptyComponent({ name: "Basic", percent: "50", countsForPfWage: true }),
    emptyComponent({ name: "Special Allowance", isBalancing: true }),
  ],
  pfApplicable: true,
  pfEmployeePercent: "",
  pfCapAtCeiling: true,
  pfWageCeiling: "",
  esiApplicable: true,
  esiEmployeePercent: "",
  ptApplicable: true,
  ptMonthlyAmount: "",
  deductAbsentDays: true,
  deductUnpaidLeave: true,
  otherDeductions: [],
};

function toValues(structure: SalaryStructureModel): Values {
  return {
    name: structure.name,
    description: structure.description ?? "",
    isActive: structure.isActive,
    components: structure.components.map((component) => ({
      id: component.id,
      name: component.name,
      basis: component.basis,
      amount: paiseToRupees(component.amount),
      percent: component.percent ?? "",
      isBalancing: component.isBalancing,
      countsForPfWage: component.countsForPfWage,
    })),
    pfApplicable: structure.pf.applicable,
    pfEmployeePercent: structure.pf.employeePercent ?? "",
    pfCapAtCeiling: structure.pf.capAtCeiling,
    pfWageCeiling: paiseToRupees(structure.pf.wageCeiling),
    esiApplicable: structure.esi.applicable,
    esiEmployeePercent: structure.esi.employeePercent ?? "",
    ptApplicable: structure.pt.applicable,
    ptMonthlyAmount: paiseToRupees(structure.pt.monthlyAmount),
    deductAbsentDays: structure.deductAbsentDays,
    deductUnpaidLeave: structure.deductUnpaidLeave,
    otherDeductions: structure.otherDeductions.map((deduction) => ({
      name: deduction.name,
      amount: paiseToRupees(deduction.amount),
    })),
  };
}

function blankToNull(value: string): string | null {
  const text = value.trim();
  return text.length === 0 ? null : text;
}

function paiseOrNull(value: string): number | null {
  const paise = rupeesToPaise(value);
  return paise == null || Number.isNaN(paise) ? null : paise;
}

/** The form as the API's body (and, with temporary ids, the domain's input). */
function toRequest(values: Values) {
  return {
    name: values.name.trim(),
    description: blankToNull(values.description),
    isActive: values.isActive,
    components: values.components.map((component) => ({
      id: component.id,
      name: component.name.trim(),
      basis: component.basis,
      amount:
        component.isBalancing || component.basis !== "fixed"
          ? null
          : paiseOrNull(component.amount),
      percent:
        component.isBalancing || component.basis !== "percent_of_base"
          ? null
          : blankToNull(component.percent),
      isBalancing: component.isBalancing,
      countsForPfWage: component.countsForPfWage,
    })),
    pf: {
      applicable: values.pfApplicable,
      employeePercent: values.pfApplicable
        ? blankToNull(values.pfEmployeePercent)
        : null,
      capAtCeiling: values.pfCapAtCeiling,
      wageCeiling:
        values.pfApplicable && values.pfCapAtCeiling
          ? paiseOrNull(values.pfWageCeiling)
          : null,
    },
    esi: {
      applicable: values.esiApplicable,
      employeePercent: values.esiApplicable
        ? blankToNull(values.esiEmployeePercent)
        : null,
    },
    pt: {
      applicable: values.ptApplicable,
      monthlyAmount: values.ptApplicable
        ? paiseOrNull(values.ptMonthlyAmount)
        : null,
    },
    deductAbsentDays: values.deductAbsentDays,
    deductUnpaidLeave: values.deductUnpaidLeave,
    otherDeductions: values.otherDeductions.map((deduction) => ({
      name: deduction.name.trim(),
      amount: paiseOrNull(deduction.amount) ?? 0,
    })),
  };
}

/** The structure as typed, checked by the domain rules, for the sample. */
function previewOf(values: Values): {
  structure: SalaryStructure | null;
  problem: string | null;
} {
  const request = toRequest(values);
  const input: SalaryStructureInput = {
    ...request,
    name: request.name.length === 0 ? "Sample" : request.name,
    components: request.components.map((component, index) => ({
      ...component,
      id: component.id ?? `new-${String(index)}`,
    })),
  };
  try {
    return { structure: createSalaryStructure(input), problem: null };
  } catch (error) {
    if (error instanceof DomainError)
      return { structure: null, problem: error.message };
    return {
      structure: null,
      problem: "Complete the components to see the calculation.",
    };
  }
}

function Section({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-6 rounded-xl border p-6">
      <div className="space-y-1">
        <h3 id={id} className="text-lg font-semibold">
          {title}
        </h3>
        <p className="text-muted-foreground text-sm">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function SwitchRow({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      </div>
      <Switch
        id={id}
        aria-describedby={`${id}-hint`}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

function PercentInput({
  id,
  invalid,
  ...props
}: ComponentProps<typeof InputGroupInput> & {
  id: string;
  invalid: boolean;
}) {
  return (
    <InputGroup>
      <InputGroupInput
        id={id}
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={invalid}
        {...props}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText>%</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  );
}

/**
 * Add or edit a salary structure (CM-314): details, earnings components
 * with the one balancing component, PF / ESI / professional tax with their
 * overrides, deduction switches and other deductions, and a live sample
 * calculation beside it. The server checks every rule again.
 */
function SalaryStructureForm({
  structure,
  onSave,
  saving,
}: {
  structure: SalaryStructureModel | null;
  onSave: (body: ReturnType<typeof toRequest>) => Promise<unknown>;
  saving: boolean;
}) {
  const router = useRouter();
  const { data: statutory } = useSuspenseQuery(salaryStatutoryQuery);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: structure == null ? NEW_VALUES : toValues(structure),
  });
  const components = useFieldArray({
    control: form.control,
    name: "components",
  });
  const deductions = useFieldArray({
    control: form.control,
    name: "otherDeductions",
  });
  const watched = useWatch({ control: form.control }) as Values;
  const preview = useMemo(() => previewOf(watched), [watched]);
  const errors = form.formState.errors;

  const submit = async (values: Values) => {
    try {
      await onSave(toRequest(values));
      router.push(SALARY_STRUCTURES_PATH);
    } catch (error) {
      const field = serverField(error);
      const message =
        error instanceof QueryHttpError
          ? error.message
          : "Something went wrong. Please try again.";
      form.setError(field ?? "root", { message });
    }
  };

  return (
    <form
      noValidate
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit(submit)(event);
      }}
    >
      <div className="min-w-0 space-y-6">
        <Section
          id="salary-structure-details"
          title="Details"
          hint="What this structure is for. Members get it on the Employees screen."
        >
          <div className="space-y-1.5">
            <Label htmlFor="salary-structure-name">Name</Label>
            <Input
              id="salary-structure-name"
              className="h-10"
              placeholder="Site staff"
              aria-invalid={errors.name != null}
              {...form.register("name")}
            />
            <FieldError message={errors.name?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="salary-structure-description">Description</Label>
            <Textarea
              id="salary-structure-description"
              placeholder="Engineers and supervisors"
              aria-invalid={errors.description != null}
              {...form.register("description")}
            />
            <FieldError message={errors.description?.message} />
          </div>
          <Controller
            name="isActive"
            control={form.control}
            render={({ field }) => (
              <SwitchRow
                id="salary-structure-active"
                label="Active"
                hint="Only active structures can be given to more members."
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </Section>

        <Section
          id="salary-structure-components"
          title="Earnings components"
          hint="Each is a fixed amount or a percentage of the member's base salary. The balancing component gets what is left, so the components always add up to the base salary. Without one, the percentages must make 100%."
        >
          <ol aria-label="Components" className="space-y-4">
            {components.fields.map((item, index) => (
              <ComponentRow
                key={item.id}
                index={index}
                form={form}
                canRemove={components.fields.length > 1}
                onRemove={() => {
                  components.remove(index);
                }}
              />
            ))}
          </ol>
          <FieldError
            message={
              errors.components?.message ?? errors.components?.root?.message
            }
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              components.append(emptyComponent());
            }}
          >
            <Plus aria-hidden="true" />
            Add component
          </Button>
        </Section>

        <Section
          id="salary-structure-statutory"
          title="PF, ESI and professional tax"
          hint="Rates and ceilings come from the government figures in force each month. Fill an override only when your Company pays differently."
        >
          <StatutoryFields form={form} statutory={statutory} />
        </Section>

        <Section
          id="salary-structure-deductions"
          title="Deductions"
          hint="What comes off a member's pay besides PF, ESI and professional tax."
        >
          <Controller
            name="deductAbsentDays"
            control={form.control}
            render={({ field }) => (
              <SwitchRow
                id="salary-structure-absent"
                label="Deduct for absent days"
                hint="Pay is cut by a day's share for each absent day; a half day is half a day."
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <Controller
            name="deductUnpaidLeave"
            control={form.control}
            render={({ field }) => (
              <SwitchRow
                id="salary-structure-unpaid"
                label="Deduct for unpaid leave"
                hint="Pay is cut by a day's share for each day of unpaid leave."
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Other deductions</legend>
            <p className="text-muted-foreground text-xs">
              A fixed amount every month, like canteen or a uniform.
            </p>
            {deductions.fields.length > 0 ? (
              <ul aria-label="Other deductions" className="space-y-3">
                {deductions.fields.map((item, index) => (
                  <li
                    key={item.id}
                    className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-start"
                  >
                    <div className="space-y-1.5">
                      <Label
                        htmlFor={`deduction-${String(index)}-name`}
                        className="sm:sr-only"
                      >
                        Deduction {index + 1} name
                      </Label>
                      <Input
                        id={`deduction-${String(index)}-name`}
                        className="h-10"
                        placeholder="Canteen"
                        aria-invalid={
                          errors.otherDeductions?.[index]?.name != null
                        }
                        {...form.register(`otherDeductions.${index}.name`)}
                      />
                      <FieldError
                        message={errors.otherDeductions?.[index]?.name?.message}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        htmlFor={`deduction-${String(index)}-amount`}
                        className="sm:sr-only"
                      >
                        Deduction {index + 1} amount
                      </Label>
                      <MoneyInput
                        id={`deduction-${String(index)}-amount`}
                        aria-invalid={
                          errors.otherDeductions?.[index]?.amount != null
                        }
                        {...form.register(`otherDeductions.${index}.amount`)}
                      />
                      <FieldError
                        message={
                          errors.otherDeductions?.[index]?.amount?.message
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove deduction ${String(index + 1)}`}
                      onClick={() => {
                        deductions.remove(index);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                deductions.append({ name: "", amount: "" });
              }}
            >
              <Plus aria-hidden="true" />
              Add deduction
            </Button>
          </fieldset>
        </Section>

        <FormAlert message={errors.root?.message} />

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link
            href={SALARY_STRUCTURES_PATH}
            className={buttonVariants({ variant: "outline" })}
          >
            Cancel
          </Link>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      <div className="lg:sticky lg:top-6">
        <SalarySample
          structure={preview.structure}
          problem={preview.problem}
          statutory={statutory}
        />
      </div>
    </form>
  );
}

type FormApi = ReturnType<typeof useForm<Values>>;

function ComponentRow({
  index,
  form,
  canRemove,
  onRemove,
}: {
  index: number;
  form: FormApi;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const [basis, isBalancing, name] = useWatch({
    control: form.control,
    name: [
      `components.${index}.basis`,
      `components.${index}.isBalancing`,
      `components.${index}.name`,
    ],
  });
  const errors = form.formState.errors.components?.[index];
  const prefix = `component-${String(index)}`;
  const label =
    name.trim().length > 0 ? name.trim() : `Component ${String(index + 1)}`;
  return (
    <li className="space-y-3 rounded-lg border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${prefix}-name`}>Component name</Label>
          <Input
            id={`${prefix}-name`}
            className="h-10"
            placeholder="Basic"
            aria-invalid={errors?.name != null}
            {...form.register(`components.${index}.name`)}
          />
          <FieldError message={errors?.name?.message} />
        </div>
        {isBalancing ? (
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Amount</span>
            <p className="text-muted-foreground flex h-10 items-center text-sm">
              What is left of the base salary
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${prefix}-basis`}>Worked out as</Label>
              <Controller
                name={`components.${index}.basis`}
                control={form.control}
                render={({ field }) => (
                  <Select
                    items={BASIS_ITEMS}
                    value={field.value}
                    onValueChange={(value) => {
                      if (value != null) field.onChange(value);
                    }}
                  >
                    <SelectTrigger
                      id={`${prefix}-basis`}
                      size="lg"
                      className="w-full min-w-0"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                      align="start"
                      alignItemWithTrigger={false}
                      aria-label="How the component is worked out"
                    >
                      {BASIS_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            {basis === "fixed" ? (
              <div className="space-y-1.5">
                <Label htmlFor={`${prefix}-amount`}>Amount</Label>
                <MoneyInput
                  id={`${prefix}-amount`}
                  aria-invalid={errors?.amount != null}
                  {...form.register(`components.${index}.amount`)}
                />
                <FieldError message={errors?.amount?.message} />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor={`${prefix}-percent`}>Percent</Label>
                <PercentInput
                  id={`${prefix}-percent`}
                  invalid={errors?.percent != null}
                  {...form.register(`components.${index}.percent`)}
                />
                <FieldError message={errors?.percent?.message} />
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Controller
          name={`components.${index}.isBalancing`}
          control={form.control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Switch
                id={`${prefix}-balancing`}
                checked={field.value}
                onCheckedChange={(checked) => {
                  // One balancing component: turning one on turns the others off.
                  if (checked)
                    form.getValues("components").forEach((_, other) => {
                      if (other !== index)
                        form.setValue(
                          `components.${other}.isBalancing`,
                          false,
                          { shouldDirty: true },
                        );
                    });
                  field.onChange(checked);
                }}
              />
              <Label htmlFor={`${prefix}-balancing`}>Balancing</Label>
            </div>
          )}
        />
        <Controller
          name={`components.${index}.countsForPfWage`}
          control={form.control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id={`${prefix}-pf`}
                checked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked);
                }}
              />
              <Label htmlFor={`${prefix}-pf`}>Counts for PF wage</Label>
            </div>
          )}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          disabled={!canRemove}
          aria-label={`Remove ${label}`}
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" />
          Remove
        </Button>
      </div>
    </li>
  );
}

function StatutoryFields({
  form,
  statutory,
}: {
  form: FormApi;
  statutory: SalaryStatutoryModel;
}) {
  const [pfApplicable, pfCapAtCeiling, esiApplicable, ptApplicable] = useWatch({
    control: form.control,
    name: ["pfApplicable", "pfCapAtCeiling", "esiApplicable", "ptApplicable"],
  });
  const errors = form.formState.errors;
  const pfPercent = statutory.pf?.employeePercent.replace(/\.00$/, "");
  const esiPercent = statutory.esi?.employeePercent.replace(/0$/, "");
  const ceiling =
    statutory.pf == null ? null : paiseToRupees(statutory.pf.wageCeiling);
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Controller
          name="pfApplicable"
          control={form.control}
          render={({ field }) => (
            <SwitchRow
              id="salary-structure-pf"
              label="Provident Fund (PF)"
              hint="Worked out on the components that count for PF wage."
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
        {pfApplicable ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="salary-structure-pf-percent">Employee PF</Label>
              <PercentInput
                id="salary-structure-pf-percent"
                placeholder={
                  pfPercent == null ? "" : `${pfPercent} (statutory)`
                }
                invalid={errors.pfEmployeePercent != null}
                {...form.register("pfEmployeePercent")}
              />
              <FieldError message={errors.pfEmployeePercent?.message} />
            </div>
            <div className="space-y-3">
              <Controller
                name="pfCapAtCeiling"
                control={form.control}
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="salary-structure-pf-cap"
                      checked={field.value}
                      onCheckedChange={(checked) => {
                        field.onChange(checked);
                      }}
                    />
                    <Label htmlFor="salary-structure-pf-cap">
                      Cap at the PF wage ceiling
                    </Label>
                  </div>
                )}
              />
              {pfCapAtCeiling ? (
                <div className="space-y-1.5">
                  <Label htmlFor="salary-structure-pf-ceiling">
                    PF wage ceiling
                  </Label>
                  <MoneyInput
                    id="salary-structure-pf-ceiling"
                    placeholder={
                      ceiling == null ? "" : `${ceiling} (statutory)`
                    }
                    aria-invalid={errors.pfWageCeiling != null}
                    {...form.register("pfWageCeiling")}
                  />
                  <FieldError message={errors.pfWageCeiling?.message} />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <div className="space-y-4">
        <Controller
          name="esiApplicable"
          control={form.control}
          render={({ field }) => (
            <SwitchRow
              id="salary-structure-esi"
              label="Employees' State Insurance (ESI)"
              hint="Charged only to members whose gross was within the ESI ceiling at the start of the contribution period."
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
        {esiApplicable ? (
          <div className="space-y-1.5 sm:w-1/2 sm:pr-2">
            <Label htmlFor="salary-structure-esi-percent">Employee ESI</Label>
            <PercentInput
              id="salary-structure-esi-percent"
              placeholder={
                esiPercent == null ? "" : `${esiPercent} (statutory)`
              }
              invalid={errors.esiEmployeePercent != null}
              {...form.register("esiEmployeePercent")}
            />
            <FieldError message={errors.esiEmployeePercent?.message} />
          </div>
        ) : null}
      </div>
      <div className="space-y-4">
        <Controller
          name="ptApplicable"
          control={form.control}
          render={({ field }) => (
            <SwitchRow
              id="salary-structure-pt"
              label="Professional tax"
              hint="From the slabs of the state chosen in HRMS Settings, unless you set a flat amount."
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
        {ptApplicable ? (
          <div className="space-y-1.5 sm:w-1/2 sm:pr-2">
            <Label htmlFor="salary-structure-pt-amount">
              Flat amount a month
            </Label>
            <MoneyInput
              id="salary-structure-pt-amount"
              placeholder="State slab"
              aria-invalid={errors.ptMonthlyAmount != null}
              {...form.register("ptMonthlyAmount")}
            />
            <FieldError message={errors.ptMonthlyAmount?.message} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FormPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-6xl space-y-6">
        <div className="space-y-1">
          <Link
            href={SALARY_STRUCTURES_PATH}
            className={buttonVariants({
              variant: "link",
              className:
                "text-muted-foreground hover:text-foreground h-auto gap-1.5 p-0 text-sm font-normal",
            })}
          >
            <ArrowLeft aria-hidden="true" />
            Back to Salary Structures
          </Link>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Configuration → Salary Structures → Add (CM-314). */
export function NewSalaryStructureScreen() {
  const create = useCreateSalaryStructure();
  return (
    <FormPage title="Add salary structure">
      <SalaryStructureForm
        structure={null}
        saving={create.isPending}
        onSave={(body) => create.mutateAsync(body)}
      />
    </FormPage>
  );
}

/** Configuration → Salary Structures → Edit (CM-314). */
export function EditSalaryStructureScreen({ id }: { id: string }) {
  const { data } = useSuspenseQuery(salaryStructureQuery(id));
  const update = useUpdateSalaryStructure(id);
  return (
    <FormPage title={`Edit ${data.name}`}>
      <SalaryStructureForm
        structure={data}
        saving={update.isPending}
        onSave={(body) =>
          update.mutateAsync({ ...body, expectedUpdatedAt: data.updatedAt })
        }
      />
    </FormPage>
  );
}
