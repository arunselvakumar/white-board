import { queryOptions } from "@tanstack/react-query";

import type {
  CentreRoyaltyStatementView,
  RoyaltyStatementView,
} from "@/src/preschool/application/royalty-views";

import { apiJson } from "../http";
import { preschoolKeys } from "./me";

export type PreschoolRoyaltyStatement = RoyaltyStatementView;
export type PreschoolCentreRoyaltyStatement = CentreRoyaltyStatementView;

export const preschoolRoyaltyKeys = {
  all: [...preschoolKeys.all, "royalty"] as const,
  statement: (month: string) =>
    [...preschoolRoyaltyKeys.all, "statement", month] as const,
  centre: (centreId: string, month: string) =>
    [...preschoolRoyaltyKeys.all, "centre", centreId, month] as const,
};

/** The month's Royalty Statement (YYYY-MM). */
export function preschoolRoyaltyQueryOptions(month: string) {
  return queryOptions({
    queryKey: preschoolRoyaltyKeys.statement(month),
    queryFn: ({ meta }) =>
      apiJson<PreschoolRoyaltyStatement>(
        `/api/preschool/royalty?month=${month}`,
        {},
        meta,
      ),
  });
}

/** One Franchised Centre's statement with its Fee Payments. */
export function preschoolCentreRoyaltyQueryOptions(
  centreId: string,
  month: string,
) {
  return queryOptions({
    queryKey: preschoolRoyaltyKeys.centre(centreId, month),
    queryFn: ({ meta }) =>
      apiJson<PreschoolCentreRoyaltyStatement>(
        `/api/preschool/royalty/${encodeURIComponent(centreId)}?month=${month}`,
        {},
        meta,
      ),
  });
}
