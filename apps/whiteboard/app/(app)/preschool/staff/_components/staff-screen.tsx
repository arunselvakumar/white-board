"use client";

import { UsersThreeIcon } from "@phosphor-icons/react/ssr";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";

import { FormAlert } from "@/components/auth/form-alert";
import { useActiveCentre } from "@/app/(app)/preschool/_components/active-centre-provider";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import {
  classroomKeys,
  classroomsQueryOptions,
  setClassTeachers,
  type PreschoolClassroom,
} from "@/src/queries/preschool/classrooms";
import {
  activateStaff,
  createStaff,
  deactivateStaff,
  inviteStaff,
  staffKeys,
  staffQueryOptions,
  updateStaffDetails,
  type PreschoolStaff,
  type PreschoolStaffInvitationOutcome,
} from "@/src/queries/preschool/staff";

import { StaffFormDialog, type StaffFormInput } from "./staff-form-dialog";
import { StaffTable } from "./staff-table";

type InvitationNotice = {
  staff: PreschoolStaff;
  outcome: Exclude<PreschoolStaffInvitationOutcome, "not_sent">;
};

/**
 * Changes which Classrooms a member is Class Teacher of, one Classroom at a
 * time through its Class Teachers (the Staff details operation does not
 * carry Classrooms).
 */
async function moveClassTeacher(
  staffId: string,
  from: readonly string[],
  to: readonly string[],
  classrooms: readonly PreschoolClassroom[],
): Promise<void> {
  for (const classroom of classrooms) {
    const was = from.includes(classroom.id);
    const is = to.includes(classroom.id);
    if (was === is) continue;
    const others = classroom.teachers
      .map((teacher) => teacher.staffId)
      .filter((id) => id !== staffId);
    await setClassTeachers(classroom.id, is ? [...others, staffId] : others);
  }
}

function InvitationResult({
  notice,
  retrying,
  onRetry,
  onDismiss,
}: {
  notice: InvitationNotice;
  retrying: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const { staff, outcome } = notice;
  const failed = outcome === "failed";
  return (
    <Alert variant={failed ? "destructive" : "default"} className="pr-24">
      <AlertTitle>
        {outcome === "sent"
          ? "Invitation sent"
          : outcome === "already_member"
            ? "Already a member — they can sign in"
            : "Could not send the invitation"}
      </AlertTitle>
      <AlertDescription>
        {outcome === "sent"
          ? `${staff.name} gets an email at ${staff.email ?? "their address"} to join this Workspace.`
          : outcome === "already_member"
            ? `${staff.name} already belongs to this Workspace and signs in with ${staff.email ?? "their email"}.`
            : `${staff.name} was saved, but the email did not go out.`}
      </AlertDescription>
      <div className="absolute top-2 right-2 flex gap-1">
        {failed ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={retrying}
            onClick={onRetry}
          >
            Retry
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </Alert>
  );
}

/** The active Centre's Staff (Owner and Centre Heads). */
export function StaffScreen() {
  const queryClient = useQueryClient();
  const { centre, me } = useActiveCentre();
  const { data } = useSuspenseQuery(staffQueryOptions(centre.id));
  const { data: classrooms } = useSuspenseQuery(
    classroomsQueryOptions(centre.id),
  );
  const [editing, setEditing] = useState<PreschoolStaff | "new" | null>(null);
  const [notice, setNotice] = useState<InvitationNotice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isOwner = me.role === "owner";

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: staffKeys.all }),
      queryClient.invalidateQueries({ queryKey: classroomKeys.all }),
    ]);
  const showOutcome = (
    staff: PreschoolStaff,
    outcome: PreschoolStaffInvitationOutcome,
  ) => {
    setNotice(outcome === "not_sent" ? null : { staff, outcome });
  };
  const failWith = (fallback: string) => (failure: unknown) => {
    setError(
      failure instanceof Error && failure.message !== ""
        ? failure.message
        : fallback,
    );
  };

  const save = useMutation({
    mutationFn: async (input: StaffFormInput) => {
      if (editing === "new" || editing == null) {
        const result = await createStaff({ ...input, centreId: centre.id });
        showOutcome(result.staff, result.invitation);
        return;
      }
      const { classroomIds, ...details } = input;
      await updateStaffDetails(editing.id, details);
      if (details.role !== "helper")
        await moveClassTeacher(
          editing.id,
          editing.classrooms.map((classroom) => classroom.id),
          classroomIds,
          classrooms.items,
        );
    },
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
  });
  const invite = useMutation({
    mutationFn: (member: PreschoolStaff) => inviteStaff(member.id),
    onMutate: () => {
      setError(null);
    },
    onSuccess: async (result) => {
      showOutcome(result.staff, result.invitation);
      await refresh();
    },
    onError: failWith("Could not send the invitation. Please try again."),
  });
  const toggle = useMutation({
    mutationFn: (member: PreschoolStaff) =>
      member.status === "active"
        ? deactivateStaff(member.id)
        : activateStaff(member.id),
    onMutate: () => {
      setError(null);
    },
    onSuccess: refresh,
    onError: failWith("Could not change this Staff member."),
  });

  const addButton = (
    <Button
      type="button"
      onClick={() => {
        setError(null);
        setEditing("new");
      }}
    >
      <Plus aria-hidden="true" />
      Add Staff member
    </Button>
  );

  return (
    <PreschoolPage
      title="Staff"
      meta={centre.name}
      actions={data.items.length === 0 ? undefined : addButton}
    >
      {notice == null ? null : (
        <InvitationResult
          notice={notice}
          retrying={invite.isPending}
          onRetry={() => {
            invite.mutate(notice.staff);
          }}
          onDismiss={() => {
            setNotice(null);
          }}
        />
      )}
      <FormAlert message={error ?? undefined} />
      {data.items.length === 0 ? (
        <EmptyState
          className="border"
          icon={UsersThreeIcon}
          tone="violet"
          title="No Staff yet"
          description="Add the Centre Head, Teachers and helpers who work at this Centre."
          actions={addButton}
        />
      ) : (
        <StaffTable
          staff={data.items}
          canManage={(member) => isOwner || member.role !== "centre_head"}
          pendingId={
            invite.isPending
              ? invite.variables.id
              : toggle.isPending
                ? toggle.variables.id
                : null
          }
          onEdit={(member) => {
            setError(null);
            setEditing(member);
          }}
          onInvite={(member) => {
            invite.mutate(member);
          }}
          onToggleStatus={(member) => {
            toggle.mutate(member);
          }}
        />
      )}
      <StaffFormDialog
        open={editing != null}
        staff={editing === "new" ? null : editing}
        canAddCentreHead={isOwner}
        classrooms={classrooms.items.map((classroom) => ({
          id: classroom.id,
          label: classroom.name,
          detail: classroom.programmeName,
        }))}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSubmit={async (input) => {
          await save.mutateAsync(input);
        }}
      />
    </PreschoolPage>
  );
}
