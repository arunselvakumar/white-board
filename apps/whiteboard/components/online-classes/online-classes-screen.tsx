"use client";

import { useAuth } from "@clerk/nextjs";
import { useSuspenseQuery } from "@tanstack/react-query";

import { calendarQueries } from "@/src/queries/calendar";

import { OnlineClassesView } from "./online-classes-view";

export function OnlineClassesScreen() {
  const { userId, orgId, orgRole } = useAuth();
  const { data } = useSuspenseQuery(
    calendarQueries.schedule(`${orgId}:${userId}:${orgRole}`),
  );

  return (
    <OnlineClassesView
      items={data.items}
      classChanges={data.classChanges}
      holidays={data.holidays}
    />
  );
}
