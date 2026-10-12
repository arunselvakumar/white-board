"use client";

import { useAuth } from "@repo/auth/react";
import { useSuspenseQueries } from "@tanstack/react-query";

import { absenceNoticeQueries } from "@/src/queries/absence-notices";
import { classTestQueries } from "@/src/queries/class-tests";
import { classWorkQueries } from "@/src/queries/class-work";
import { familyHomeQueries } from "@/src/queries/family-home";

import { FamilyHome, type FamilyHomeRole } from "./family-home";

export function FamilyHomeScreen({ role }: { role: FamilyHomeRole }) {
  const { workspaceId, userId } = useAuth();
  const sessionScope = `${workspaceId}:${userId}:${role}`;
  const [home, classWork, results, absenceNotices] = useSuspenseQueries({
    queries: [
      familyHomeQueries.get(sessionScope),
      classWorkQueries.family(sessionScope),
      classTestQueries.family(sessionScope),
      absenceNoticeQueries.family(sessionScope),
    ],
  });
  return (
    <FamilyHome
      home={home.data}
      classWork={classWork.data}
      results={results.data}
      absenceNotices={absenceNotices.data}
      role={role}
    />
  );
}
