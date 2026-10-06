"use client";

import {
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
} from "@/src/queries/calendar";
import { dashboardQueries } from "@/src/queries/dashboard";

import { CalendarView } from "./calendar-view";

async function refresh(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: calendarQueries.key.all }),
    queryClient.invalidateQueries({ queryKey: dashboardQueries.key.all }),
    queryClient.invalidateQueries({ queryKey: ["classes"] }),
  ]);
}

export function CalendarScreen() {
  const { userId, orgId, orgRole } = useAuth();
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(
    calendarQueries.schedule(`${orgId}:${userId}:${orgRole}`),
  );
  return (
    <CalendarView
      items={data.items}
      classChanges={data.classChanges}
      holidays={data.holidays}
      permissions={data.permissions}
      classActions={{
        onCancel: async (key, reason) => {
          await cancelClass(key, reason);
          await refresh(queryClient);
        },
        onMove: async (key, input) => {
          await moveClass(key, input);
          await refresh(queryClient);
        },
        onRestore: async (key) => {
          await restoreClass(key);
          await refresh(queryClient);
        },
      }}
      holidayActions={{
        onDeclare: async (input) => {
          await declareHoliday(input);
          await refresh(queryClient);
        },
        onRemove: async (id) => {
          await removeHoliday(id);
          await refresh(queryClient);
        },
      }}
    />
  );
}
