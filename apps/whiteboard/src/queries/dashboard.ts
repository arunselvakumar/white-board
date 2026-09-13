import { queryOptions } from "@tanstack/react-query";

import type { TimingSlot } from "./batches";
import { apiJson } from "./http";

export type DashboardResponse = {
  activeStudentCount: number;
  outstandingDuesPaise: number;
  todayBatches: {
    id: string;
    name: string;
    courseId: string;
    classMode: "offline" | "online" | "hybrid";
    capacity: number;
    enrolledCount: number;
    timings: TimingSlot[];
  }[];
  recentStudents: {
    id: string;
    name: string;
    phone: string;
    createdAt: string;
  }[];
};

export const dashboardQueries = {
  key: {
    all: ["dashboard"] as const,
  },
  get: () =>
    queryOptions({
      queryKey: dashboardQueries.key.all,
      queryFn: () => apiJson<DashboardResponse>("/api/dashboard"),
    }),
};
