"use client";

import { useSuspenseQueries } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";

import { FeesCatalog } from "@/components/fees/fees-catalog";
import {
  feeDuesQueries,
  type FeeDuesFilter,
  type FeeDuesSort,
} from "@/src/queries/fee-dues";

export function FeesScreen() {
  const [filter, setFilter] = useState<FeeDuesFilter>("all");
  const [sort, setSort] = useState<FeeDuesSort>("amount");
  // The first load suspends at the page boundary. After that, a new filter or
  // sort renders in the background: React keeps showing the last dues list
  // until the new one has loaded, instead of flashing the fallback.
  const shownFilter = useDeferredValue(filter);
  const shownSort = useDeferredValue(sort);
  const [{ data: dues }, { data: followUpsDue }] = useSuspenseQueries({
    queries: [
      feeDuesQueries.list(shownFilter, shownSort),
      feeDuesQueries.followUpsDue(),
    ],
  });

  return (
    <FeesCatalog
      dues={dues}
      followUpsDue={followUpsDue.items}
      filter={filter}
      sort={sort}
      updating={filter !== shownFilter || sort !== shownSort}
      onFilterChange={setFilter}
      onSortChange={setSort}
    />
  );
}
