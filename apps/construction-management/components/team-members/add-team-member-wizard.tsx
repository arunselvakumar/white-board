"use client";

import { useActiveCompany } from "@repo/auth/construction/react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button, buttonVariants } from "@repo/ui/components/button";

import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { PermissionMatrix } from "@/components/permissions/permission-matrix";
import { fieldForCode } from "@/lib/server-errors";
import {
  TEAM_MEMBERS_KEY,
  createTeamMember,
  designationOptionsQuery,
  type TeamMember,
} from "@/src/queries/team-members";
import {
  hrmsDefaultPermissions,
  type PermissionGrants,
} from "@/src/shared-kernel/access";

const HRMS_GRANTS = hrmsDefaultPermissions().toGrants();

import { ProjectsStep } from "./projects-step";
import { ShareInviteDialog } from "./share-invite-dialog";
import {
  DETAIL_ERROR_FIELDS,
  EMPTY_DETAILS,
  TeamMemberDetailsFields,
  detailsInput,
  teamMemberDetailsSchema,
  type TeamMemberDetailsValues,
} from "./team-member-details-fields";

type Step = "details" | "projects" | "permissions";

const STEP_LABELS: Record<Step, string> = {
  details: "Details",
  projects: "Select Projects",
  permissions: "Permission Matrix",
};

/**
 * Add Team Member (CM-111): details → Projects → Permission Matrix, then the
 * invite link. HRMS members skip Projects and get the HRMS default set.
 */
export function AddTeamMemberWizard() {
  const { data: designations } = useSuspenseQuery(designationOptionsQuery);
  const { company } = useActiveCompany();
  const queryClient = useQueryClient();
  const form = useForm<TeamMemberDetailsValues>({
    resolver: zodResolver(teamMemberDetailsSchema),
    defaultValues: EMPTY_DETAILS,
  });
  const memberType = useWatch({ control: form.control, name: "memberType" });
  const designationId = useWatch({
    control: form.control,
    name: "designationId",
  });
  const [step, setStep] = useState<Step>("details");
  // The matrix the Owner edited, and the Designation it started from.
  const [matrix, setMatrix] = useState<{
    designationId: string;
    grants: PermissionGrants;
  } | null>(null);
  const [created, setCreated] = useState<TeamMember | null>(null);
  const [sharing, setSharing] = useState(false);

  const template =
    designations.find((item) => item.id === designationId)?.template ?? {};
  const grants: PermissionGrants =
    memberType === "hrms"
      ? HRMS_GRANTS
      : matrix?.designationId === designationId
        ? matrix.grants
        : template;

  const steps: Step[] =
    memberType === "hrms"
      ? ["details", "permissions"]
      : ["details", "projects", "permissions"];
  const index = steps.indexOf(step);

  const mutation = useMutation({
    mutationFn: createTeamMember,
    onSuccess: async (member) => {
      await queryClient.invalidateQueries({ queryKey: TEAM_MEMBERS_KEY });
      setCreated(member);
    },
  });

  const next = async () => {
    if (step === "details" && !(await form.trigger())) return;
    const following = steps[index + 1];
    if (following != null) setStep(following);
  };

  const submit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync({
        ...detailsInput(values, { keepIdentifiersWhenBlank: false }),
        projectIds: [],
        permissions: memberType === "hrms" ? undefined : grants,
      });
    } catch (error) {
      const { field, message } = fieldForCode(error, DETAIL_ERROR_FIELDS);
      if (field == null) {
        form.setError("root", { message });
        return;
      }
      form.setError(field, { message });
      setStep("details");
    }
  });

  if (created != null)
    return (
      <div className="w-full p-6">
        <div className="w-full max-w-4xl space-y-6">
          <div className="space-y-4 rounded-lg border p-8 text-center">
            <CheckCircle2
              aria-hidden="true"
              className="text-primary mx-auto size-10"
            />
            <h1 className="text-2xl font-semibold tracking-tight">
              {created.name} is invited
            </h1>
            <p className="text-muted-foreground text-sm">
              They show as Joining Pending until they sign in with{" "}
              {created.mobile ?? created.email} and accept.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {created.invitePath != null && (
                <Button
                  onClick={() => {
                    setSharing(true);
                  }}
                >
                  Share invite link
                </Button>
              )}
              <Link
                href="/app/masters/team-members"
                className={buttonVariants({ variant: "outline" })}
              >
                Back to Team Members
              </Link>
            </div>
          </div>
          {created.invitePath != null && (
            <ShareInviteDialog
              open={sharing}
              onOpenChange={setSharing}
              memberName={created.name}
              companyName={company?.name ?? "our Company"}
              invitePath={created.invitePath}
            />
          )}
        </div>
      </div>
    );

  const last = index === steps.length - 1;

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Team Members", href: "/app/masters/team-members" }}
          title="Add Team Member"
          meta={`Step ${String(index + 1)} of ${String(steps.length)}: ${STEP_LABELS[step]}`}
        />
        <ol className="flex gap-1.5" aria-label="Steps">
          {steps.map((item, position) => (
            <li
              key={item}
              aria-current={item === step ? "step" : undefined}
              className={`h-1 flex-1 rounded-full ${position <= index ? "bg-primary" : "bg-border"}`}
            >
              <span className="sr-only">{STEP_LABELS[item]}</span>
            </li>
          ))}
        </ol>

        <form
          noValidate
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (last) void submit(event);
            else void next();
          }}
        >
          {step === "details" && (
            <TeamMemberDetailsFields form={form} designations={designations} />
          )}
          {step === "projects" && <ProjectsStep />}
          {step === "permissions" && (
            <div className="space-y-3">
              <p className="text-muted-foreground text-sm">
                {memberType === "hrms"
                  ? "HRMS Team Members get the HRMS default set: their own attendance, leave and salary."
                  : Object.keys(template).length > 0
                    ? "Started from the Designation's template. Changes here apply to this Team Member only."
                    : "This Designation has no template. Tick what this Team Member may do."}
              </p>
              <PermissionMatrix
                value={grants}
                readOnly={memberType === "hrms"}
                onChange={(next) => {
                  setMatrix({ designationId, grants: next });
                }}
              />
            </div>
          )}

          <FormAlert message={form.formState.errors.root?.message} />

          <div className="flex justify-between gap-3">
            {index > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const previous = steps[index - 1];
                  if (previous != null) setStep(previous);
                }}
              >
                Back
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={mutation.isPending}>
              {last
                ? mutation.isPending
                  ? "Inviting…"
                  : "Add and invite"
                : "Continue"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
