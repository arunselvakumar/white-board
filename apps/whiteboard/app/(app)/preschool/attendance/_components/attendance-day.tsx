"use client";

import { BabyIcon } from "@phosphor-icons/react/ssr";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { CheckCheck } from "lucide-react";
import { useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";

import { CountStrip } from "@/app/(app)/preschool/_components/count-strip";
import { useStatusToast } from "@/app/(app)/preschool/_components/status-toast";
import { timeInIndia } from "@/src/preschool/domain/dates";
import {
  checkInPreschoolChild,
  checkOutPreschoolChild,
  markPreschoolAttendance,
  preschoolAttendanceDayQueryOptions,
  preschoolAttendanceKeys,
  undoPreschoolCheckOut,
  type PreschoolAttendanceDay,
  type PreschoolAttendanceMark,
  type PreschoolAttendanceRosterChild,
  type PreschoolAttendanceStatus,
  type PreschoolChildAttendanceDay,
} from "@/src/queries/preschool/attendance";

import { attendanceErrorMessage } from "./attendance-errors";
import { AttendanceRow } from "./attendance-row";
import { CheckOutPanel } from "./check-out-panel";

function countsOf(children: readonly PreschoolAttendanceRosterChild[]) {
  const counts = {
    present: 0,
    absent: 0,
    leave: 0,
    notMarked: 0,
    checkedOut: 0,
  };
  for (const child of children) {
    if (child.mark == null) counts.notMarked += 1;
    else {
      counts[child.mark.status] += 1;
      if (child.mark.checkOutTime != null) counts.checkedOut += 1;
    }
  }
  return counts;
}

/** What a new status looks like before the server answers. */
function optimisticMark(
  existing: PreschoolAttendanceMark | null,
  status: PreschoolAttendanceStatus,
  checkInNow: string | null,
): PreschoolAttendanceMark {
  if (status === "present" && existing?.status === "present") return existing;
  return {
    status,
    checkInTime: status === "present" ? checkInNow : null,
    droppedBy: null,
    checkOutTime: null,
    collectedBy: null,
    note: null,
  };
}

/** One Classroom's register for a day. */
export function AttendanceDay({
  classroomId,
  date,
  today,
}: {
  classroomId: string;
  date: string;
  today: string;
}) {
  const queryClient = useQueryClient();
  const options = preschoolAttendanceDayQueryOptions(classroomId, date);
  const { data } = useSuspenseQuery(options);
  const { show, toast } = useStatusToast();
  const [collecting, setCollecting] =
    useState<PreschoolAttendanceRosterChild | null>(null);
  const isToday = date === today;
  const nowTime = timeInIndia(new Date());

  const setChildren = (
    change: (
      child: PreschoolAttendanceRosterChild,
    ) => PreschoolAttendanceRosterChild,
  ) => {
    queryClient.setQueryData<PreschoolAttendanceDay>(options.queryKey, (day) =>
      day == null ? day : { ...day, children: day.children.map(change) },
    );
  };
  const applyChildDay = (result: PreschoolChildAttendanceDay) => {
    setChildren((child) =>
      child.childId === result.childId
        ? { ...child, mark: result.mark }
        : child,
    );
  };
  const afterChange = () =>
    queryClient.invalidateQueries({
      queryKey: preschoolAttendanceKeys.all,
      refetchType: "none",
    });

  const mark = useMutation({
    mutationFn: (
      marks: { childId: string; status: PreschoolAttendanceStatus }[],
    ) => markPreschoolAttendance({ classroomId, date, marks }),
    onMutate: async (marks) => {
      await queryClient.cancelQueries({ queryKey: options.queryKey });
      const before = queryClient.getQueryData<PreschoolAttendanceDay>(
        options.queryKey,
      );
      const byChild = new Map(
        marks.map((entry) => [entry.childId, entry.status]),
      );
      setChildren((child) => {
        const status = byChild.get(child.childId);
        return status == null
          ? child
          : {
              ...child,
              mark: optimisticMark(
                child.mark,
                status,
                isToday ? nowTime : null,
              ),
            };
      });
      return { before };
    },
    onError: (error, _marks, context) => {
      if (context?.before != null)
        queryClient.setQueryData(options.queryKey, context.before);
      show(`Not saved: ${attendanceErrorMessage(error)}`);
    },
    onSuccess: async (day) => {
      queryClient.setQueryData(options.queryKey, day);
      await afterChange();
    },
  });
  const checkIn = useMutation({
    mutationFn: (input: { childId: string; time: string }) =>
      checkInPreschoolChild({ ...input, date }),
    onSuccess: async (result) => {
      applyChildDay(result);
      await afterChange();
    },
    onError: (error) => {
      show(attendanceErrorMessage(error));
    },
  });
  const undo = useMutation({
    mutationFn: (childId: string) => undoPreschoolCheckOut({ childId, date }),
    onSuccess: async (result) => {
      applyChildDay(result);
      await afterChange();
    },
    onError: (error) => {
      show(attendanceErrorMessage(error));
    },
  });

  const counts = countsOf(data.children);
  const nobodyMarked =
    data.children.length > 0 && counts.notMarked === data.children.length;

  return (
    <div className="space-y-4">
      {data.editable ? null : (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Badge variant="outline">Read only</Badge>
          You can view this day but not change it.
        </p>
      )}
      <CountStrip
        label="Attendance counts"
        items={[
          { label: "Present", value: counts.present, tone: "green" },
          { label: "Absent", value: counts.absent, tone: "red" },
          { label: "Leave", value: counts.leave, tone: "amber" },
          { label: "Not marked", value: counts.notMarked, tone: "muted" },
          { label: "Checked out", value: counts.checkedOut, tone: "sky" },
        ]}
      />
      {data.children.length === 0 ? (
        <EmptyState
          className="border"
          size="md"
          icon={BabyIcon}
          tone="violet"
          title="No Children in this Classroom"
          description="Children appear here once they are admitted to the Classroom."
        />
      ) : (
        <>
          {data.editable && nobodyMarked ? (
            <Button
              type="button"
              className="h-12 w-full text-base sm:w-auto"
              disabled={mark.isPending}
              onClick={() => {
                mark.mutate(
                  data.children.map((child) => ({
                    childId: child.childId,
                    status: "present" as const,
                  })),
                );
              }}
            >
              <CheckCheck aria-hidden="true" />
              Mark everyone present
            </Button>
          ) : null}
          <ul aria-label="Children" className="grid gap-2 lg:grid-cols-2">
            {data.children.map((child) => (
              <AttendanceRow
                key={child.childId}
                child={child}
                editable={data.editable}
                onStatus={(status) => {
                  mark.mutate([{ childId: child.childId, status }]);
                }}
                onCheckIn={async (time) => {
                  await checkIn.mutateAsync({ childId: child.childId, time });
                }}
                onCheckOut={() => {
                  setCollecting(child);
                }}
                onUndoCheckOut={() => {
                  undo.mutate(child.childId);
                }}
              />
            ))}
          </ul>
        </>
      )}
      <CheckOutPanel
        child={collecting}
        isToday={isToday}
        nowTime={nowTime}
        onOpenChange={(open) => {
          if (!open) setCollecting(null);
        }}
        onSubmit={async (child, input) => {
          const result = await checkOutPreschoolChild({
            ...input,
            childId: child.childId,
            date,
          });
          applyChildDay(result);
          setCollecting(null);
          await afterChange();
        }}
      />
      {toast}
    </div>
  );
}
