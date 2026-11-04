"use client";

import {
  navigateInApp,
  useActiveCompany,
  useCompanyAuthSnapshot,
} from "@repo/auth/construction/react";
import { useMutation } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { SidebarSwitcher } from "@repo/ui/components/sidebar-chrome";

import { switchCompany } from "@/src/queries/companies";

import { BrandMark } from "./brand-mark";

/**
 * The first row of the sidebar (ADR-0050): the product mark, the Active
 * Company and the product's name, opening the User's Companies to switch
 * to another one (CM-105) or create a new one.
 */
export function CompanySwitcher() {
  const { company } = useActiveCompany();
  const { companies } = useCompanyAuthSnapshot();
  const switching = useMutation({
    mutationFn: switchCompany,
    onSuccess: () => {
      navigateInApp("/app/projects");
    },
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarSwitcher
            mark={<BrandMark className="size-9 rounded-xl" />}
            name={company?.name ?? "No Company"}
            detail="Construction Management"
            aria-label={`Active Company: ${company?.name ?? "none"}. Switch Company`}
          />
        }
      />
      <DropdownMenuContent
        align="start"
        className="w-(--anchor-width) min-w-56"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Your Companies</DropdownMenuLabel>
          {companies.map((item) => {
            const active = item.id === company?.id;
            return (
              <DropdownMenuItem
                key={item.id}
                disabled={switching.isPending}
                onClick={() => {
                  if (!active) switching.mutate(item.id);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                {active && (
                  <Check aria-label="Active" className="text-primary size-4" />
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/create-company" />}>
          <Plus />
          Create a Company
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
