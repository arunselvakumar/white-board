"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { useActiveCentre } from "@/app/(app)/preschool/_components/active-centre-provider";
import { preschoolCentreDashboardQueryOptions } from "@/src/queries/preschool/dashboard";

import { CentreDashboard } from "./centre-dashboard";

/** The active Centre's dashboard (Owner, Centre Head). */
export function CentreDashboardScreen() {
  const { centre } = useActiveCentre();
  const { data } = useSuspenseQuery(
    preschoolCentreDashboardQueryOptions(centre.id),
  );
  return <CentreDashboard data={data} centreName={centre.name} />;
}
