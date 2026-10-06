"use client";

import { useAuth } from "@clerk/nextjs";
import { useSuspenseQuery } from "@tanstack/react-query";

import { familyHomeQueries } from "@/src/queries/family-home";

import { FamilyHome, type FamilyHomeRole } from "./family-home";

export function FamilyHomeScreen({ role }: { role: FamilyHomeRole }) {
  const { orgId, userId } = useAuth();
  const { data } = useSuspenseQuery(
    familyHomeQueries.get(`${orgId}:${userId}:${role}`),
  );
  return <FamilyHome home={data} role={role} />;
}
