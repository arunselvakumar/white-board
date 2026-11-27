"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";
import { CalendarCheck, History, UserRound } from "lucide-react";

import { EmployeeFiles } from "@/app/app/staff/employees/_components/employee-files";
import {
  EmployeeForm,
  FormPage,
} from "@/app/app/staff/employees/_components/employee-form";
import {
  employeeFormDefaults,
  updateEmployeePayload,
  type EmployeeFormMode,
} from "@/app/app/staff/employees/_components/employee-form-schema";
import { projectsLabel } from "@/app/app/staff/employees/_components/employee-projects";
import { SignInBadge } from "@/app/app/staff/employees/_components/employee-sign-in";
import { PersonAttendance } from "@/app/app/_components/person-attendance/person-attendance";
import { EMPLOYEES_PATH } from "@/lib/staff-nav";
import {
  employeeQuery,
  useUpdateEmployee,
  type EmployeeResponse,
} from "@/src/queries/employees";
import { employeeAttendanceQuery } from "@/src/queries/person-attendance";

import { EmployeeActivity } from "./employee-activity";
import { SetPasswordDialog, type PasswordOutcome } from "./set-password-dialog";

const TABS = ["details", "attendance", "activity"] as const;

/** "Labour · Human Resources", the Role and the Department it is under. */
export function roleLabel(employee: {
  role: { name: string };
  department: { name: string } | null;
}): string {
  return employee.department == null
    ? employee.role.name
    : `${employee.role.name} · ${employee.department.name}`;
}

function Meta({ employee }: { employee: EmployeeResponse }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {roleLabel(employee)} · {projectsLabel(employee.projects)}
      <SignInBadge signIn={employee.signIn} />
      {employee.isActive ? null : <Badge variant="outline">Inactive</Badge>}
    </span>
  );
}

/**
 * An Employee's page (ADR CM-0055 §5, CM-0051): Details (Edit Employee's
 * form, with Photo & documents), Attendance and Activity, the tab kept in
 * the address (`?tab=activity`). Details stays mounted while another tab
 * shows, so typed changes survive a tab switch.
 */
export function EmployeePage({
  id,
  now,
}: {
  id: string;
  /** For stories: what "Today" is in the feed. */
  now?: Date;
}) {
  const { data } = useSuspenseQuery(employeeQuery(id));
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(TABS).withDefault("details"),
  );
  return (
    <FormPage
      title={`Edit ${data.name}`}
      watermark="Employees"
      meta={<Meta employee={data} />}
    >
      <Tabs
        value={tab}
        onValueChange={(next: (typeof TABS)[number]) => {
          void setTab(next === "details" ? null : next);
        }}
      >
        <TabsList>
          <TabsTrigger value="details">
            <UserRound aria-hidden="true" />
            Details
          </TabsTrigger>
          <TabsTrigger value="attendance">
            <CalendarCheck aria-hidden="true" />
            Attendance
          </TabsTrigger>
          <TabsTrigger value="activity">
            <History aria-hidden="true" />
            Activity
          </TabsTrigger>
        </TabsList>
        <TabsContent value="details" keepMounted className="pt-4">
          <EditEmployeeDetails employee={data} />
        </TabsContent>
        <TabsContent value="attendance" className="pt-4">
          <PersonAttendance
            query={employeeAttendanceQuery(id)}
            emptyMessage="Days marked on the attendance sheet, or by Check-In, will show here."
          />
        </TabsContent>
        <TabsContent value="activity" className="pt-4">
          <EmployeeActivity employeeId={id} now={now} />
        </TabsContent>
      </Tabs>
    </FormPage>
  );
}

/** What Set password did, for the line under the sign-in status. */
function PasswordNotice({ outcome }: { outcome: PasswordOutcome }) {
  return outcome.passwordIgnored === "existing_account" ? (
    <p role="alert" className="bg-card rounded-lg border px-4 py-3 text-sm">
      Someone already signs in with this mobile number, so we did not set the
      password. {outcome.name} got a Join Request instead.
    </p>
  ) : (
    <p
      role="status"
      className="bg-card text-muted-foreground rounded-lg border px-4 py-3 text-sm"
    >
      Password set. {outcome.name} signs in with their mobile number and that
      password, and must change it the next time they sign in.
    </p>
  );
}

/** Edit Employee's files and form: the Employee page's Details tab. */
export function EditEmployeeDetails({
  employee,
}: {
  employee: EmployeeResponse;
}) {
  const update = useUpdateEmployee(employee.id);
  const [settingPassword, setSettingPassword] = useState(false);
  const [outcome, setOutcome] = useState<PasswordOutcome | null>(null);
  // Amounts and bank come back null without Financial on Employees.
  const mode: EmployeeFormMode = {
    showAmounts: employee.overtimeWagePerHour != null,
    showBank: employee.bank != null,
    hasSignIn: employee.canSignIn,
  };
  return (
    <div className="space-y-6">
      <EmployeeFiles employee={employee} />
      <EmployeeForm
        key={employee.updatedAt}
        employee={employee}
        mode={mode}
        defaults={employeeFormDefaults(employee)}
        saving={update.isPending}
        onSetPassword={() => {
          setOutcome(null);
          setSettingPassword(true);
        }}
        signInNotice={
          outcome == null ? null : <PasswordNotice outcome={outcome} />
        }
        onSave={async (values) => {
          await update.mutateAsync(
            updateEmployeePayload(values, {
              ...mode,
              expectedUpdatedAt: employee.updatedAt,
            }),
          );
          return EMPLOYEES_PATH;
        }}
      />
      {employee.signIn?.canSetPassword === true && (
        <SetPasswordDialog
          employee={employee}
          open={settingPassword}
          onOpenChange={setSettingPassword}
          onDone={(next) => {
            setSettingPassword(false);
            setOutcome(next);
          }}
        />
      )}
    </div>
  );
}
