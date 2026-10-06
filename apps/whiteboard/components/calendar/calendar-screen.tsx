"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";

import {
  calendarQueries,
  cancelClass,
  declareHoliday,
  moveClass,
  removeHoliday,
  restoreClass,
  type ClassKey,
  type ClassSlotTime,
} from "@/src/queries/calendar";
import { classQueries } from "@/src/queries/classes";
import { dashboardQueries } from "@/src/queries/dashboard";

import { CalendarView } from "./calendar-view";

async function invalidateSchedule(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: calendarQueries.key.all }),
    queryClient.invalidateQueries({ queryKey: dashboardQueries.key.all }),
    queryClient.invalidateQueries({ queryKey: classQueries.key.all }),
  ]);
}

export function CalendarScreen() {
  const { userId, orgId, orgRole } = useAuth();
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(
    calendarQueries.schedule(`${orgId}:${userId}:${orgRole}`),
  );
  const onSuccess = () => invalidateSchedule(queryClient);
  const cancel = useMutation({
    mutationFn: ({ key, reason }: { key: ClassKey; reason: string | null }) =>
      cancelClass(key, reason),
    onSuccess,
  });
  const move = useMutation({
    mutationFn: ({
      key,
      input,
    }: {
      key: ClassKey;
      input: ClassSlotTime & { reason: string | null };
    }) => moveClass(key, input),
    onSuccess,
  });
  const restore = useMutation({ mutationFn: restoreClass, onSuccess });
  const declare = useMutation({ mutationFn: declareHoliday, onSuccess });
  const remove = useMutation({ mutationFn: removeHoliday, onSuccess });

  return (
    <CalendarView
      items={data.items}
      classChanges={data.classChanges}
      holidays={data.holidays}
      permissions={data.permissions}
      classActions={{
        onCancel: async (key, reason) => {
          await cancel.mutateAsync({ key, reason });
        },
        onMove: async (key, input) => {
          await move.mutateAsync({ key, input });
        },
        onRestore: async (key) => {
          await restore.mutateAsync(key);
        },
      }}
      holidayActions={{
        onDeclare: async (input) => {
          await declare.mutateAsync(input);
        },
        onRemove: async (id) => {
          await remove.mutateAsync(id);
        },
      }}
    />
  );
}
