"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { useActiveCentre } from "@/app/(app)/preschool/_components/active-centre-provider";
import type { MeChildView } from "@/src/preschool/application/me";

/**
 * Which of the Parent's Children a family page shows, kept in `?child=` so
 * the choice follows the Parent from page to page. The first Child when the
 * URL names none (or one that is not theirs).
 */
export function useFamilyChild(): {
  children: readonly MeChildView[];
  child: MeChildView | null;
  setChildId: (id: string) => void;
  /** `?child=<id>` for links to other family pages; empty with one Child. */
  childQuery: string;
} {
  const { me } = useActiveCentre();
  const router = useRouter();
  const pathname = usePathname() || "/preschool/family";
  const searchParams = useSearchParams();
  const [wanted, setWanted] = useState(() => searchParams.get("child"));
  const child =
    me.children.find((each) => each.id === wanted) ?? me.children[0] ?? null;

  return {
    children: me.children,
    child,
    setChildId: (id) => {
      setWanted(id);
      const params = new URLSearchParams(searchParams.toString());
      params.set("child", id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    childQuery:
      child == null || me.children.length < 2 ? "" : `?child=${child.id}`,
  };
}
