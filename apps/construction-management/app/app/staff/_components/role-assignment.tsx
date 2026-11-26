"use client";

import { useId } from "react";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { FormSection } from "@/components/forms/form-section";

/** The Department every Labour, Site Engineer and Vendor is under. */
const DEPARTMENT = "Human Resources";

/** The default Role each staff page stands for (ADR CM-0054). */
export type StaffRoleName = "Labour" | "Site Engineer" | "Vendor";

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
 * Role assignment on Add and Edit Labour, Site Engineer and Vendor (ADR
 * CM-0054): the Department and Role this kind of staff is under, shown in
 * two disabled dropdowns. Nothing here is saved; the page decides the Role.
 */
export function RoleAssignment({ role }: { role: StaffRoleName }) {
  return (
    <FormSection
      title="Role assignment"
      hint={`Every ${role} is on the ${role} Role under ${DEPARTMENT}.`}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FixedSelect label="Department" value={DEPARTMENT} />
        <FixedSelect label="Role" value={role} />
      </div>
    </FormSection>
  );
}
