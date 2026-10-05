"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";

import { calendarQueries } from "@/src/queries/calendar";

import { CalendarView } from "./calendar-view";

export function CalendarScreen() {
  const { userId, orgId, orgRole } = useAuth();
  const { data } = useSuspenseQuery(
    calendarQueries.schedule(`${orgId}:${userId}:${orgRole}`),
  );
  return <CalendarView items={data.items} />;
}
