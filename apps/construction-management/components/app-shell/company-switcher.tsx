"use client";

import { useActiveCompany } from "@repo/auth/construction/react";
import { Building } from "lucide-react";

/**
 * The Active Company in the header. A placeholder until switching between
 * Companies arrives (CM-105).
 */
export function CompanySwitcher() {
  const { company } = useActiveCompany();
  return (
    <p
      className="text-muted-foreground flex min-w-0 items-center gap-2 text-sm"
      aria-label="Active Company"
    >
      <Building aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">{company?.name ?? "No Company"}</span>
    </p>
  );
}
