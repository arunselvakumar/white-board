import { queryOptions } from "@tanstack/react-query";

import type { FamilyHomeReadModel } from "@/src/training-institute/application/family-home";

import { apiJson } from "./http";

export type FamilyHomeResponse = FamilyHomeReadModel;
export type FamilyHomeStudent = FamilyHomeResponse["students"][number];

export const familyHomeQueries = {
  key: { all: ["family-home"] as const },
  get: (sessionScope: string) =>
    queryOptions({
      queryKey: [...familyHomeQueries.key.all, sessionScope] as const,
      queryFn: () =>
        apiJson<FamilyHomeResponse>("/api/training-institute/home"),
    }),
};
