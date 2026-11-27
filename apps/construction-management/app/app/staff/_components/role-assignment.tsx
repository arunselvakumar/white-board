"use client";

import { useId, type ReactNode } from "react";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { FieldError } from "@/components/auth/field-error";
import { FormSection } from "@/components/forms/form-section";

/** The Department every Vendor is under. */
const DEPARTMENT = "Human Resources";

/** The default Role a staff page stands for (ADR CM-0054). */
export type StaffRoleName = "Vendor";

type Choice = { value: string; label: string };

function FixedSelect({ label, value }: { label: string; value: string }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select items={[{ value, label: value }]} value={value} disabled>
        <SelectTrigger id={id} className="h-10 w-full min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          <SelectItem value={value}>{value}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Role assignment on Add and Edit Vendor (ADR CM-0054): the Department and
 * Role a Vendor is under, shown in two disabled dropdowns. These are the
 * defaults, fixed in the page, not read from the Company's Roles: an admin
 * may have moved the Role to another Department. Nothing here is saved.
 */
export function RoleAssignment({ role }: { role: StaffRoleName }) {
  return (
    <FormSection
      title="Role assignment"
      hint={`The default Department and Role for a ${role}. Shown for reference; not saved.`}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FixedSelect label="Department" value={DEPARTMENT} />
        <FixedSelect label="Role" value={role} />
      </div>
    </FormSection>
  );
}

function ChoiceSelect({
  id,
  label,
  value,
  choices,
  placeholder,
  onChange,
  error,
  disabled = false,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  choices: readonly Choice[];
  placeholder: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  const hintId = `${id}-hint`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} required>
        {label}
      </Label>
      <Select
        items={choices}
        value={value === "" ? null : value}
        disabled={disabled}
        onValueChange={(next) => {
          if (next == null) return;
          onChange(next);
        }}
      >
        <SelectTrigger
          id={id}
          size="lg"
          className="w-full min-w-0"
          aria-required
          aria-invalid={error != null}
          aria-describedby={hint == null ? undefined : hintId}
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
      {hint == null ? null : (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
      <FieldError message={error} />
    </div>
  );
}

/**
 * Role assignment on Add and Edit Employee (ADR CM-0055 §2): the
 * Department, then a Role under it, both required and saved as the Role
 * (the Department is the Role's). Picking another Department clears the
 * Role.
 */
export function EmployeeRoleAssignment({
  departmentId,
  roleId,
  departments,
  roles,
  onDepartmentChange,
  onRoleChange,
  departmentError,
  roleError,
}: {
  departmentId: string;
  roleId: string;
  departments: readonly Choice[];
  /** The Roles under `departmentId`. */
  roles: readonly Choice[];
  onDepartmentChange: (departmentId: string) => void;
  onRoleChange: (roleId: string) => void;
  departmentError?: string;
  roleError?: string;
}) {
  return (
    <FormSection
      title="Role assignment"
      hint="Their Department and Role. When they sign in, the Role decides what they may do."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <ChoiceSelect
          id="employee-department"
          label="Department"
          value={departmentId}
          choices={departments}
          placeholder="Choose a Department"
          onChange={(next) => {
            if (next !== departmentId) onDepartmentChange(next);
          }}
          error={departmentError}
        />
        <ChoiceSelect
          id="employee-role"
          label="Role"
          value={roleId}
          choices={roles}
          placeholder={
            departmentId === ""
              ? "Choose a Department first"
              : roles.length === 0
                ? "No Roles under this Department"
                : "Choose a Role"
          }
          disabled={departmentId === "" || roles.length === 0}
          onChange={onRoleChange}
          error={roleError}
        />
      </div>
    </FormSection>
  );
}
