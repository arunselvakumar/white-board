"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { storeQuery } from "@/src/queries/stores";

import { StoreForm } from "./store-form";

/** Edit store: the form over the store as loaded. */
export function EditStorePage({ storeId }: { storeId: string }) {
  const { data } = useSuspenseQuery(storeQuery(storeId));
  return <StoreForm key={data.updatedAt} store={data} />;
}
