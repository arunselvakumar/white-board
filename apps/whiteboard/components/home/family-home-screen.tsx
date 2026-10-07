"use client";

import { useAuth } from "@clerk/nextjs";
import { useSuspenseQueries } from "@tanstack/react-query";

import { classWorkQueries } from "@/src/queries/class-work";
import { familyHomeQueries } from "@/src/queries/family-home";

import { FamilyHome, type FamilyHomeRole } from "./family-home";

export function FamilyHomeScreen({ role }: { role: FamilyHomeRole }) {
  const { orgId, userId } = useAuth();
  const sessionScope = `${orgId}:${userId}:${role}`;
  const [home, classWork] = useSuspenseQueries({
    queries: [
      familyHomeQueries.get(sessionScope),
      classWorkQueries.family(sessionScope),
    ],
  });
  return <FamilyHome home={home.data} classWork={classWork.data} role={role} />;
}
