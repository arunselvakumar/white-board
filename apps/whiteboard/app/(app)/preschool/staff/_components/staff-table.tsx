"use client";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import type { PreschoolStaff } from "@/src/queries/preschool/staff";

import { STAFF_ROLE_LABEL } from "./staff-form-dialog";

const HEAD = "text-xs tracking-wide uppercase";

/** Whether and how this member can sign in. */
export function signInLabel(member: PreschoolStaff): string {
  if (!member.canSignIn) return "No sign-in";
  if (member.email == null) return "Needs an email";
  if (member.invitedAt == null) return "Not invited";
  const on = new Date(member.invitedAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
  return `Invited ${on}`;
}

/** A Centre Head or Teacher with an email, still active, can be invited. */
export function canInvite(member: PreschoolStaff): boolean {
  return member.canSignIn && member.email != null && member.status === "active";
}

/** A Centre's Staff: role, contact, Classrooms, status and sign-in. */
export function StaffTable({
  staff,
  canManage,
  pendingId,
  onEdit,
  onInvite,
  onToggleStatus,
}: {
  staff: readonly PreschoolStaff[];
  /** Whether the signed-in User may change this member (Centre Heads: Owner only). */
  canManage: (member: PreschoolStaff) => boolean;
  /** The member whose action is running. */
  pendingId: string | null;
  onEdit: (member: PreschoolStaff) => void;
  onInvite: (member: PreschoolStaff) => void;
  onToggleStatus: (member: PreschoolStaff) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead className={`pl-4 ${HEAD}`}>Name</TableHead>
            <TableHead className={HEAD}>Role</TableHead>
            <TableHead className={HEAD}>Phone</TableHead>
            <TableHead className={HEAD}>Email</TableHead>
            <TableHead className={HEAD}>Classrooms</TableHead>
            <TableHead className={HEAD}>Status</TableHead>
            <TableHead className={HEAD}>Sign-in</TableHead>
            <TableHead className={`pr-4 text-right ${HEAD}`}>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {staff.map((member) => {
            const active = member.status === "active";
            const busy = pendingId === member.id;
            return (
              <TableRow
                key={member.id}
                className={active ? undefined : "text-muted-foreground"}
              >
                <TableCell className="pl-4">
                  <p className="font-medium">{member.name}</p>
                  {member.designation == null ? null : (
                    <p className="text-muted-foreground text-xs">
                      {member.designation}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      member.role === "centre_head"
                        ? "default"
                        : member.role === "teacher"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {STAFF_ROLE_LABEL[member.role]}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-nums">
                  {member.phone ?? "—"}
                </TableCell>
                <TableCell className="max-w-48 truncate">
                  {member.email ?? "—"}
                </TableCell>
                <TableCell className="max-w-48 truncate">
                  {member.classrooms.length === 0
                    ? "—"
                    : member.classrooms
                        .map((classroom) => classroom.name)
                        .join(", ")}
                </TableCell>
                <TableCell>
                  <Badge variant={active ? "outline" : "secondary"}>
                    {active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {signInLabel(member)}
                </TableCell>
                <TableCell className="pr-4">
                  {canManage(member) ? (
                    <div className="flex justify-end gap-1">
                      {canInvite(member) ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          aria-label={`${member.invitedAt == null ? "Send invitation" : "Resend invitation"} to ${member.name}`}
                          onClick={() => {
                            onInvite(member);
                          }}
                        >
                          {member.invitedAt == null
                            ? "Send invitation"
                            : "Resend"}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Edit ${member.name}`}
                        onClick={() => {
                          onEdit(member);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        aria-label={`${active ? "Deactivate" : "Activate"} ${member.name}`}
                        onClick={() => {
                          onToggleStatus(member);
                        }}
                      >
                        {active ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
