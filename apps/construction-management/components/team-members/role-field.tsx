"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { FieldError } from "@/components/auth/field-error";
import { PermissionMatrix } from "@/components/permissions/permission-matrix";
import { ROLES_PATH } from "@/lib/users-roles-nav";
import type { Role } from "@/src/queries/roles";

/** The seeded Role HRMS Team Members start on (ADR CM-0030 §1). */
export const HRMS_STAFF_ROLE_NAME = "HRMS Staff";

export function hrmsStaffRoleId(roles: readonly Role[]): string | null {
  return roles.find((role) => role.name === HRMS_STAFF_ROLE_NAME)?.id ?? null;
}

const noop = () => undefined;

/**
 * Pick a Role, and see what it lets them do: the Role's Permission Matrix,
 * read-only. The matrix is changed on Role Management, for everyone on it.
 */
export function RoleField({
  id,
  roles,
  value,
  onChange,
  error,
}: {
  id: string;
  roles: readonly Role[];
  value: string | null;
  onChange: (roleId: string) => void;
  error?: string;
}) {
  const items = roles.map((role) => ({ value: role.id, label: role.name }));
  const chosen = roles.find((role) => role.id === value) ?? null;
  return (
    <div className="space-y-6">
      <div className="bg-card rounded-xl border p-4 sm:p-5">
        <div className="max-w-md space-y-1.5">
          <Label htmlFor={id} required>
            Role
          </Label>
          <Select
            items={items}
            value={value}
            onValueChange={(next) => {
              if (next != null) onChange(next);
            }}
          >
            <SelectTrigger
              id={id}
              size="lg"
              className="w-full min-w-0"
              aria-required
              aria-describedby={`${id}-hint`}
            >
              <SelectValue placeholder="Choose a Role" />
            </SelectTrigger>
            <SelectContent
              align="start"
              alignItemWithTrigger={false}
              aria-label="Roles"
            >
              {roles.map((role) => (
                <SelectItem
                  key={role.id}
                  value={role.id}
                  tag={role.isSeed ? "Default" : undefined}
                >
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p id={`${id}-hint`} className="text-muted-foreground text-xs">
            {chosen?.description != null && chosen.description !== ""
              ? chosen.description
              : "What they may do comes from their Role."}
          </p>
          <FieldError message={error} />
          {roles.length === 0 && (
            <p className="text-muted-foreground text-xs">
              No Roles yet.{" "}
              <Link
                href={`${ROLES_PATH}/new`}
                className="text-primary underline underline-offset-4"
              >
                Add a Role
              </Link>{" "}
              first.
            </p>
          )}
        </div>
      </div>
      {chosen != null && (
        <section aria-labelledby={`${id}-preview`} className="space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="space-y-1">
              <h2 id={`${id}-preview`} className="font-semibold">
                What this Role may do
              </h2>
              <p className="text-muted-foreground text-sm">
                Everyone on this Role gets the same access. Change it on Role
                Management.
              </p>
            </div>
            <Link
              href={`${ROLES_PATH}/${encodeURIComponent(chosen.id)}`}
              className="text-primary inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
            >
              Open in Role Management
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <PermissionMatrix
            value={chosen.permissions}
            onChange={noop}
            readOnly
          />
        </section>
      )}
    </div>
  );
}
