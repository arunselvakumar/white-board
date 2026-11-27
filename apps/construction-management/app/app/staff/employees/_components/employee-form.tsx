"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { CheckCircle2, Info, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Controller,
  useForm,
  useWatch,
  type UseFormReturn,
} from "react-hook-form";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { PageHeader } from "@/app/app/_components/app-shell/page-header";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { MobileField } from "@/components/auth/mobile-field";
import { FormSection } from "@/components/forms/form-section";
import { MoneyInput } from "@/components/money/money-input";
import { EmployeeRoleAssignment } from "@/app/app/staff/_components/role-assignment";
import {
  PendingPhoto,
  type PendingPhotoValue,
} from "@/app/app/staff/_components/staff-files";
import { WageFields } from "@/app/app/staff/_components/wage-fields";
import { EMPLOYEE_WAGE } from "@/app/app/staff/_components/wage-schema";
import type { AppHref } from "@/lib/page-href";
import { fieldForCode } from "@/lib/server-errors";
import { EMPLOYEES_PATH, employeePagePath } from "@/lib/staff-nav";
import { departmentsQuery } from "@/src/queries/departments";
import {
  uploadEmployeePhoto,
  useCreateEmployee,
  type EmployeeCreated,
  type EmployeeResponse,
} from "@/src/queries/employees";
import { lookupListQuery } from "@/src/queries/masters";
import { rolesQuery } from "@/src/queries/roles";

import { EmployeeSignInCard } from "./employee-sign-in";
import {
  BLOOD_GROUP_OPTIONS,
  GENDER_OPTIONS,
  createEmployeePayload,
  employeeErrorFields,
  employeeFormDefaults,
  employeeFormSchema,
  type EmployeeField,
  type EmployeeFormMode,
  type EmployeeFormValues,
} from "./employee-form-schema";
import { LabourCategorySheet } from "./labour-category-sheet";
import { ReportsToPicker } from "./reports-to-picker";
import {
  defaultRoleAssignment,
  departmentChoices,
  rolesUnder,
  type Choice,
  type RoleOption,
} from "./role-choices";

const NONE = "__none";

type Form = UseFormReturn<EmployeeFormValues>;

/** Live choices plus the one already saved, even when it is now disabled. */
function useChoices(
  items: { id: string; name: string; disabled: boolean }[] | undefined,
  saved: { id: string; name: string } | null | undefined,
): Choice[] {
  const choices: Choice[] = [{ value: NONE, label: "None" }];
  for (const item of items ?? [])
    if (!item.disabled || item.id === saved?.id)
      choices.push({ value: item.id, label: item.name });
  if (saved != null && !choices.some((choice) => choice.value === saved.id))
    choices.push({ value: saved.id, label: saved.name });
  return choices;
}

type TextName =
  | "name"
  | "email"
  | "fatherName"
  | "dateOfBirth"
  | "employeeCode"
  | "joiningDate"
  | "address"
  | "emergencyContact"
  | "aadhaar"
  | "pan"
  | "uanNumber"
  | "esicNumber"
  | "qualification"
  | "experienceYears"
  | "specialisation"
  | "accountHolder"
  | "accountNumber"
  | "ifsc"
  | "bankName";

/**
 * One text field. Its own component, so the fields register in page order
 * and a failed Save focuses the first one in error.
 */
function TextField({
  form,
  id,
  label,
  name,
  placeholder,
  hint,
  required = false,
  className,
  type,
  inputMode,
}: {
  form: Form;
  id: string;
  label: string;
  name: TextName;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  type?: "email" | "date";
  inputMode?: "numeric";
}) {
  const error = form.formState.errors[name]?.message;
  const hintId = `${id}-hint`;
  return (
    <div className={className ?? "space-y-1.5"}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        autoComplete="off"
        className={
          name === "pan" || name === "ifsc"
            ? "h-10 uppercase placeholder:normal-case"
            : "h-10"
        }
        aria-required={required || undefined}
        aria-invalid={error != null}
        aria-describedby={hint == null ? undefined : hintId}
        {...form.register(name)}
      />
      {hint != null && (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
      <FieldError message={error} />
    </div>
  );
}

function ChoiceField({
  form,
  id,
  label,
  name,
  choices,
  placeholder,
  action,
}: {
  form: Form;
  id: string;
  label: string;
  name: "gender" | "bloodGroup" | "labourCategoryId";
  /** The first is the "none" choice, saved as "". */
  choices: readonly Choice[];
  placeholder: string;
  /** A link under the field, on the right (Add Labour Category). */
  action?: ReactNode;
}) {
  const error = form.formState.errors[name]?.message;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Controller
        name={name}
        control={form.control}
        render={({ field }) => (
          <Select
            items={choices}
            value={field.value === "" ? NONE : field.value}
            onValueChange={(value) => {
              field.onChange(value == null || value === NONE ? "" : value);
            }}
          >
            <SelectTrigger
              id={id}
              size="lg"
              className="w-full min-w-0"
              aria-invalid={error != null}
            >
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent
              align="start"
              alignItemWithTrigger={false}
              aria-label={label}
            >
              {choices.map((choice) => (
                <SelectItem key={choice.value} value={choice.value}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {action == null ? (
        <FieldError message={error} />
      ) : (
        <div className="flex items-start justify-between gap-3">
          <FieldError message={error} />
          <div className="ml-auto shrink-0">{action}</div>
        </div>
      )}
    </div>
  );
}

function MobileInput({ form, locked }: { form: Form; locked: boolean }) {
  const canSignIn = useWatch({ control: form.control, name: "canSignIn" });
  const error = form.formState.errors.mobile?.message;
  return (
    <div className="space-y-1.5">
      <Label htmlFor="employee-mobile" required={canSignIn}>
        Mobile
      </Label>
      <MobileField
        id="employee-mobile"
        readOnly={locked}
        aria-required={canSignIn || undefined}
        aria-invalid={error != null}
        aria-describedby="employee-mobile-hint"
        {...form.register("mobile")}
      />
      <p id="employee-mobile-hint" className="text-muted-foreground text-xs">
        {locked
          ? "They sign in with this number and also work with another Company, so only they can change it."
          : canSignIn
            ? "They sign in with this number and their password."
            : "Shown on attendance and reports."}
      </p>
      <FieldError message={error} />
    </div>
  );
}

/** Department and Role, from the Company's live Departments and Roles. */
function RoleAssignmentCard({
  form,
  roles,
  departments,
}: {
  form: Form;
  roles: readonly RoleOption[];
  departments: readonly Choice[];
}) {
  const [departmentId, roleId] = useWatch({
    control: form.control,
    name: ["departmentId", "roleId"],
  });
  const errors = form.formState.errors;
  return (
    <EmployeeRoleAssignment
      departmentId={departmentId}
      roleId={roleId}
      departments={departments}
      roles={rolesUnder(roles, departmentId).map((role) => ({
        value: role.id,
        label: role.name,
      }))}
      onDepartmentChange={(next) => {
        form.setValue("departmentId", next, {
          shouldDirty: true,
          shouldValidate: form.formState.isSubmitted,
        });
        form.setValue("roleId", "", { shouldDirty: true });
      }}
      onRoleChange={(next) => {
        form.setValue("roleId", next, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }}
      departmentError={errors.departmentId?.message}
      roleError={errors.roleId?.message}
    />
  );
}

/**
 * Add and Edit Employee (ADR CM-0055 §1): Photo, Basic, Role assignment,
 * Details, Work, Wage, Bank and Sign-in, in that order. Amounts are typed
 * in rupees and sent as paise. Projects are not set here: an Employee is
 * put on a Project from the Project's Teams, and moved between Projects
 * with Transfer. Add starts with the photo (`photo`); Edit shows Photo &
 * documents above the form.
 */
export function EmployeeForm({
  employee,
  mode,
  defaults,
  onSave,
  saving,
  photo,
  onSetPassword,
  signInNotice,
}: {
  employee: EmployeeResponse | null;
  mode: EmployeeFormMode;
  defaults: EmployeeFormValues;
  /** Resolves to where to go next, or to stay when it returns "stay". */
  onSave: (values: EmployeeFormValues) => Promise<AppHref | "stay">;
  saving: boolean;
  /** Add Employee's photo, taken or chosen before Save. */
  photo?: {
    value: PendingPhotoValue | null;
    onChange: (photo: PendingPhotoValue | null) => void;
  };
  onSetPassword?: () => void;
  signInNotice?: ReactNode;
}) {
  const router = useRouter();
  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema(mode)),
    defaultValues: defaults,
  });
  const errors = form.formState.errors;
  const { data: roleItems } = useSuspenseQuery(rolesQuery);
  const { data: departmentList } = useSuspenseQuery(departmentsQuery);
  const roles: RoleOption[] = roleItems;
  const departments = departmentChoices(departmentList.items, roles);
  const [addingCategory, setAddingCategory] = useState(false);
  /** Added from the slide-over: offered even if the list reload fails. */
  const [addedCategory, setAddedCategory] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const categories = useQuery(lookupListQuery("labour-categories"));
  const categoryChoices = useChoices(
    categories.data?.items,
    employee?.labourCategory,
  );
  if (
    addedCategory != null &&
    !categoryChoices.some((choice) => choice.value === addedCategory.id)
  )
    categoryChoices.push({
      value: addedCategory.id,
      label: addedCategory.name,
    });
  const [name, roleId] = useWatch({
    control: form.control,
    name: ["name", "roleId"],
  });
  const roleName = roles.find((role) => role.id === roleId)?.name ?? null;

  const submit = form.handleSubmit(async (values) => {
    try {
      const next = await onSave(values);
      if (next !== "stay") router.push(next);
    } catch (error) {
      const { field, message } = fieldForCode<EmployeeField>(
        error,
        employeeErrorFields(values),
      );
      if (field == null) form.setError("root", { message });
      else form.setError(field, { message }, { shouldFocus: true });
    }
  });

  const masked = {
    aadhaar: employee?.aadhaarMasked ?? null,
    pan: employee?.panMasked ?? null,
    accountLast4: employee?.bank?.accountLast4 ?? null,
  };

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      {photo != null && (
        <PendingPhoto
          name={name}
          value={photo.value}
          onChange={photo.onChange}
        />
      )}

      <FormSection title="Basic">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            form={form}
            id="employee-name"
            label="Employee name"
            name="name"
            placeholder="Dhuresh Nawin"
            required
          />
          <MobileInput
            form={form}
            locked={employee?.signIn?.mobileLocked ?? false}
          />
          <TextField
            form={form}
            id="employee-email"
            label="Email"
            name="email"
            type="email"
            placeholder="dhuresh@example.com"
            hint="A contact only: they sign in with their mobile."
          />
          <ChoiceField
            form={form}
            id="employee-gender"
            label="Gender"
            name="gender"
            choices={[{ value: NONE, label: "Not given" }, ...GENDER_OPTIONS]}
            placeholder="Not given"
          />
          <TextField
            form={form}
            id="employee-dob"
            label="Date of birth"
            name="dateOfBirth"
            type="date"
          />
          <TextField
            form={form}
            id="employee-father"
            label="Father's name"
            name="fatherName"
            hint="Printed on the muster roll."
          />
          <ChoiceField
            form={form}
            id="employee-blood-group"
            label="Blood group"
            name="bloodGroup"
            choices={[
              { value: NONE, label: "Not given" },
              ...BLOOD_GROUP_OPTIONS.map((group) => ({
                value: group,
                label: group,
              })),
            ]}
            placeholder="Not given"
          />
          <TextField
            form={form}
            id="employee-code"
            label="Employee Id"
            name="employeeCode"
            placeholder="E-001"
          />
          <TextField
            form={form}
            id="employee-joining-date"
            label="Joining date"
            name="joiningDate"
            type="date"
            required
          />
        </div>
      </FormSection>

      <RoleAssignmentCard form={form} roles={roles} departments={departments} />

      <FormSection title="Details">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            form={form}
            id="employee-address"
            label="Address"
            name="address"
            placeholder="12 Anna Nagar, Madurai"
            className="space-y-1.5 sm:col-span-2"
          />
          <TextField
            form={form}
            id="employee-emergency"
            label="Emergency contact"
            name="emergencyContact"
            placeholder="Name and phone"
            className="space-y-1.5 sm:col-span-2"
          />
          <TextField
            form={form}
            id="employee-aadhaar"
            label="Aadhaar"
            name="aadhaar"
            inputMode="numeric"
            placeholder={masked.aadhaar ?? "1234 5678 9012"}
            hint={
              masked.aadhaar == null
                ? undefined
                : `Leave blank to keep ${masked.aadhaar}.`
            }
          />
          <TextField
            form={form}
            id="employee-pan"
            label="PAN"
            name="pan"
            placeholder={masked.pan ?? "ABCPE1234F"}
            hint={
              masked.pan == null
                ? undefined
                : `Leave blank to keep ${masked.pan}.`
            }
          />
          <TextField
            form={form}
            id="employee-uan"
            label="UAN"
            name="uanNumber"
            inputMode="numeric"
            placeholder="12 digits"
          />
          <TextField
            form={form}
            id="employee-esic"
            label="ESIC number"
            name="esicNumber"
            inputMode="numeric"
            placeholder="10 or 17 digits"
          />
        </div>
      </FormSection>

      <FormSection title="Work">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            form={form}
            id="employee-qualification"
            label="Qualification"
            name="qualification"
            placeholder="B.E. Civil, ITI Fitter"
          />
          <TextField
            form={form}
            id="employee-experience"
            label="Experience (years)"
            name="experienceYears"
            inputMode="numeric"
            placeholder="0"
            hint="Whole years in the trade before joining."
          />
          <TextField
            form={form}
            id="employee-specialisation"
            label="Specialisation"
            name="specialisation"
            placeholder="Civil, steel / PEB, MEP"
            className="space-y-1.5 sm:col-span-2"
          />
          <ChoiceField
            form={form}
            id="employee-category"
            label="Labour Category"
            name="labourCategoryId"
            choices={categoryChoices}
            placeholder="Choose a Labour Category"
            action={
              <Button
                type="button"
                variant="link"
                size="xs"
                className="h-auto px-0 text-sm font-medium"
                aria-label="Add Labour Category"
                onClick={() => {
                  setAddingCategory(true);
                }}
              >
                Add
              </Button>
            }
          />
          <div className="space-y-1.5">
            <Label htmlFor="employee-reports-to">Reports To</Label>
            <Controller
              name="reportsToId"
              control={form.control}
              render={({ field }) => (
                <ReportsToPicker
                  id="employee-reports-to"
                  value={field.value}
                  onChange={field.onChange}
                  saved={employee?.reportsTo ?? null}
                  excludeId={employee?.id}
                  invalid={errors.reportsToId != null}
                  aria-describedby="employee-reports-to-hint"
                />
              )}
            />
            <p
              id="employee-reports-to-hint"
              className="text-muted-foreground text-xs"
            >
              Another Employee they answer to, like a mason&apos;s helper to the
              mason, or a mason to the Site Engineer.
            </p>
            <FieldError message={errors.reportsToId?.message} />
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Wage"
        hint={
          mode.showAmounts
            ? undefined
            : "You cannot see wages. Ask the Owner for the Financial right on Employees."
        }
      >
        <WageFields
          form={form}
          name="wage"
          idPrefix="employee"
          options={EMPLOYEE_WAGE}
          showAmounts={mode.showAmounts}
        >
          {mode.showAmounts && (
            <div className="space-y-1.5">
              <Label htmlFor="employee-opening">Opening balance</Label>
              <MoneyInput
                id="employee-opening"
                className="h-10"
                placeholder="0"
                aria-describedby="employee-opening-hint"
                aria-invalid={errors.openingBalance != null}
                {...form.register("openingBalance")}
              />
              <p
                id="employee-opening-hint"
                className="text-muted-foreground text-xs"
              >
                What you owed them on the joining date. Negative for an advance
                already given.
              </p>
              <FieldError message={errors.openingBalance?.message} />
            </div>
          )}
        </WageFields>
      </FormSection>

      {mode.showBank && (
        <FormSection
          title="Bank"
          hint="Where their wage is paid. Only people with the Financial right on Employees see it."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              form={form}
              id="employee-account-holder"
              label="Account holder"
              name="accountHolder"
            />
            <TextField
              form={form}
              id="employee-account-number"
              label="Account number"
              name="accountNumber"
              placeholder={
                masked.accountLast4 == null
                  ? "50100123456789"
                  : `Ending ${masked.accountLast4}`
              }
              hint={
                masked.accountLast4 == null
                  ? undefined
                  : `Leave blank to keep the account ending ${masked.accountLast4}.`
              }
            />
            <TextField
              form={form}
              id="employee-ifsc"
              label="IFSC"
              name="ifsc"
              placeholder="HDFC0001234"
            />
            <TextField
              form={form}
              id="employee-bank-name"
              label="Bank name"
              name="bankName"
              placeholder="HDFC Bank"
            />
          </div>
        </FormSection>
      )}

      <EmployeeSignInCard
        form={form}
        roleName={roleName}
        signIn={employee?.signIn ?? null}
        mobile={employee?.mobile ?? null}
        onSetPassword={onSetPassword}
        notice={signInNotice}
      />

      <FormAlert message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Link
          href={EMPLOYEES_PATH}
          className={buttonVariants({ variant: "outline" })}
        >
          Cancel
        </Link>
      </div>
      <LabourCategorySheet
        open={addingCategory}
        onOpenChange={setAddingCategory}
        onAdded={(category) => {
          setAddedCategory({ id: category.id, name: category.name });
          form.setValue("labourCategoryId", category.id, {
            shouldDirty: true,
            shouldValidate: true,
          });
        }}
      />
    </form>
  );
}

export function FormPage({
  title,
  watermark,
  meta,
  children,
}: {
  title: string;
  watermark?: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Employees", href: EMPLOYEES_PATH }}
          title={title}
          watermark={watermark}
          meta={meta}
        />
        {children}
      </div>
    </div>
  );
}

/** What Add did when they can sign in: they can now, or got a Join Request. */
function AddedEmployee({ created }: { created: EmployeeCreated }) {
  let icon: LucideIcon = CheckCircle2;
  let title: string;
  let text: string;
  if (created.passwordIgnored === "existing_account") {
    icon = Info;
    title = `${created.name} already has an account`;
    text =
      "Someone already signs in with this mobile number, so we did not set the password. They got a Join Request instead: they sign in with their own password and accept it.";
  } else {
    title = `${created.name} can sign in now`;
    text = `They sign in with their mobile number and the password you set, on the ${created.role.name} Role, and must change it the first time they sign in.`;
  }
  const Icon = icon;
  return (
    <div className="bg-card space-y-4 rounded-lg border p-8 text-center">
      <Icon aria-hidden="true" className="text-primary mx-auto size-10" />
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="text-muted-foreground mx-auto max-w-prose text-sm">
        {text}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link
          href={EMPLOYEES_PATH}
          className={buttonVariants({ variant: "outline" })}
        >
          Back to Employees
        </Link>
        <Link
          href={employeePagePath(created.id)}
          className={buttonVariants({ variant: "outline" })}
        >
          Open {created.name}
        </Link>
      </div>
    </div>
  );
}

/**
 * Add Employee: starts on Human Resources → Labour (ADR CM-0055 §2), with
 * the Bank card only for Financial on Employees.
 */
export function NewEmployeeScreen({ canSeeBank }: { canSeeBank: boolean }) {
  const create = useCreateEmployee();
  const { data: roles } = useSuspenseQuery(rolesQuery);
  const [photo, setPhoto] = useState<PendingPhotoValue | null>(null);
  const [created, setCreated] = useState<EmployeeCreated | null>(null);
  const mode: EmployeeFormMode = {
    showAmounts: true,
    showBank: canSeeBank,
    hasSignIn: false,
  };
  return (
    <FormPage title="Add Employee">
      {created == null ? (
        <EmployeeForm
          employee={null}
          mode={mode}
          defaults={employeeFormDefaults(null, defaultRoleAssignment(roles))}
          saving={create.isPending}
          photo={{ value: photo, onChange: setPhoto }}
          onSave={async (values) => {
            const saved = await create.mutateAsync(
              createEmployeePayload(values, mode),
            );
            let next: AppHref = EMPLOYEES_PATH;
            if (photo != null)
              try {
                await uploadEmployeePhoto(saved.id, photo.file);
              } catch {
                // The Employee is saved; their page shows no photo, to try again.
                next = employeePagePath(saved.id);
              }
            if (!saved.canSignIn) return next;
            setCreated(saved);
            return "stay";
          }}
        />
      ) : (
        <AddedEmployee created={created} />
      )}
    </FormPage>
  );
}
