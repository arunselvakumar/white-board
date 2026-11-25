"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";

import { FormAlert } from "@/components/auth/form-alert";
import { CheckboxList } from "@/app/(app)/preschool/_components/checkbox-list";
import {
  classroomKeys,
  setClassTeachers,
  type PreschoolClassroomDetail,
} from "@/src/queries/preschool/classrooms";
import { staffKeys, staffQueryOptions } from "@/src/queries/preschool/staff";

const ROLE_LABEL = { centre_head: "Centre Head", teacher: "Teacher" } as const;

/**
 * A Classroom's Class Teachers: the Centre's active Teachers and Centre
 * Heads, picked in place (Owner and Centre Heads).
 */
export function ClassTeachersEditor({
  classroom,
}: {
  classroom: PreschoolClassroomDetail;
}) {
  const queryClient = useQueryClient();
  const { data: staff } = useSuspenseQuery(
    staffQueryOptions(classroom.centreId),
  );
  const current = classroom.teachers.map((teacher) => teacher.staffId);
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<string[]>(current);
  const save = useMutation({
    mutationFn: (staffIds: string[]) =>
      setClassTeachers(classroom.id, staffIds),
    onSuccess: async () => {
      setEditing(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: classroomKeys.all }),
        queryClient.invalidateQueries({ queryKey: staffKeys.all }),
      ]);
    },
  });
  const candidates = staff.items
    .filter(
      (member) =>
        member.role !== "helper" &&
        (member.status === "active" || current.includes(member.id)),
    )
    .map((member) => ({
      id: member.id,
      label: member.name,
      detail:
        member.status === "active"
          ? ROLE_LABEL[member.role as keyof typeof ROLE_LABEL]
          : "Inactive",
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Class Teachers</h2>
        </CardTitle>
        {editing || classroom.isArchived ? null : (
          <CardAction>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                save.reset();
                setPicked(current);
                setEditing(true);
              }}
            >
              Change Class Teachers
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {editing ? (
          <>
            <FormAlert
              message={
                save.error == null
                  ? undefined
                  : save.error.message ||
                    "Could not save the Class Teachers. Please try again."
              }
            />
            <CheckboxList
              legend="Class Teachers"
              idPrefix="class-teacher"
              items={candidates}
              value={picked}
              onChange={setPicked}
              emptyText="This Centre has no active Teachers yet. Add them under Staff."
            />
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={save.isPending}
                onClick={() => {
                  save.mutate(picked);
                }}
              >
                {save.isPending ? "Saving…" : "Save Class Teachers"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm">
            {classroom.teachers.length === 0
              ? "No Class Teacher yet."
              : classroom.teachers.map((teacher) => teacher.name).join(", ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
