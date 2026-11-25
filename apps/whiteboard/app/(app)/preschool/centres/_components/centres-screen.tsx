"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { preschoolCentreQueries } from "@/src/queries/preschool/centres";

import { CentreList } from "./centre-list";

export function CentresScreen() {
  const router = useRouter();
  const { data } = useSuspenseQuery(preschoolCentreQueries.list());
  return (
    <CentreList
      centres={data.items}
      onAdd={() => {
        router.push("/preschool/centres/new");
      }}
    />
  );
}
