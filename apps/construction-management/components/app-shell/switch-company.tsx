"use client";

import {
  navigateInApp,
  useActiveCompany,
  useCompanyAuthSnapshot,
} from "@repo/auth/construction/react";
import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@repo/ui/components/button";
import { SidebarSwitch } from "@repo/ui/components/sidebar-chrome";

import { switchCompany } from "@/src/queries/companies";

const SWITCH_ERROR = "Could not switch to that Company. Please try again.";

const ROLE_LABEL = { owner: "Owner", member: "Team Member" } as const;

/**
 * Switch Company, a row at the foot of the sidebar (ADR-0051). It opens a
 * modal of the User's Companies to switch to another one (CM-105) or create
 * a new one. In this product the word is Company: Workspace is the main
 * menu's cross-Project area.
 */
export function SwitchCompany({ rowClassName }: { rowClassName: string }) {
  const { company } = useActiveCompany();
  const { companies } = useCompanyAuthSnapshot();
  const switching = useMutation({
    mutationFn: switchCompany,
    onSuccess: () => {
      navigateInApp("/app/projects");
    },
  });
  // Success keeps the spinner on: the app is reloading at Projects.
  const pendingId =
    switching.isPending || switching.isSuccess ? switching.variables : null;

  return (
    <SidebarSwitch
      label="Switch Company"
      rowLabel={`Switch Company. Active Company: ${company?.name ?? "none"}`}
      description="Pick the Company you want to work in."
      rowClassName={rowClassName}
      items={companies.map((item) => ({
        id: item.id,
        name: item.name,
        detail: ROLE_LABEL[item.role],
      }))}
      activeId={company?.id ?? null}
      pendingId={pendingId}
      error={switching.isError ? SWITCH_ERROR : null}
      onPick={(id) => {
        switching.mutate(id);
      }}
      onOpenChange={() => {
        if (switching.isError) switching.reset();
      }}
      footer={
        <Link
          href="/create-company"
          className={buttonVariants({
            variant: "outline",
            className: "h-10 w-full",
          })}
        >
          <Plus />
          Create a Company
        </Link>
      }
    />
  );
}
