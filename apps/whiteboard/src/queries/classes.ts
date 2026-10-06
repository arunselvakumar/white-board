import { queryOptions } from "@tanstack/react-query";

import type { ClassDetail } from "@/src/training-institute/application/class-service";

import { apiJson } from "./http";

export function classPath(
  batchId: string,
  date: string,
  startTime: string,
): string {
  return `/classes/${encodeURIComponent(batchId)}/${encodeURIComponent(date)}/${encodeURIComponent(startTime)}`;
}

export function classApiPath(
  batchId: string,
  date: string,
  startTime: string,
): string {
  return `/api${classPath(batchId, date, startTime)}`;
}

export const classQueries = {
  key: { all: ["classes"] as const },
  detail: (scope: string, batchId: string, date: string, startTime: string) =>
    queryOptions({
      queryKey: [
        ...classQueries.key.all,
        scope,
        batchId,
        date,
        startTime,
      ] as const,
      queryFn: () =>
        apiJson<ClassDetail>(classApiPath(batchId, date, startTime)),
      refetchInterval: 5000,
    }),
};
