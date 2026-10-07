"use client";

import { useAuth } from "@repo/auth/react";
import { useSuspenseQuery } from "@tanstack/react-query";

import { calendarQueries } from "@/src/queries/calendar";

import { OnlineClassesView } from "./online-classes-view";

export function OnlineClassesScreen() {
  const { userId, workspaceId, role } = useAuth();
  const { data } = useSuspenseQuery(
    calendarQueries.schedule(`${workspaceId}:${userId}:${role}`),
  );

  return (
    <OnlineClassesView
      items={data.items}
      classChanges={data.classChanges}
      holidays={data.holidays}
    />
  );
}
