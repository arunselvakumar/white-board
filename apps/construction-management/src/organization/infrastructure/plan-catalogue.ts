import type { PlanGrant } from "@/src/shared-kernel/plan";

import { PlanCatalogue } from "../domain/plan";
import catalogue from "./seeds/plans.json";

type CatalogueFile = {
  version: number;
  currency: string;
  plans: {
    code: string;
    name: string;
    rank: number;
    durations: { months: number; pricePaise: number }[];
    includes: Record<PlanGrant, number>;
  }[];
  addOns: {
    grant: PlanGrant;
    name: string;
    unitSize: number;
    pricePerUnitPerMonthPaise: number;
    minimumQuantity: number;
  }[];
};

/**
 * The plans on sale (CM-116), versioned JSON so prices change without code.
 * Orders store `catalogueVersion` with their price snapshot.
 */
export const planCatalogue = PlanCatalogue.of(catalogue as CatalogueFile);
