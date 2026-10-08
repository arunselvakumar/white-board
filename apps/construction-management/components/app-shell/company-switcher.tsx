"use client";

import {
  navigateInApp,
  useActiveCompany,
  useCompanyAuthSnapshot,
} from "@repo/auth/construction/react";
import { useMutation } from "@tanstack/react-query";
import { Building, Check, ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";

import { switchCompany } from "@/src/queries/companies";

/** The Active Company in the header, and switching to another one (CM-105). */
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
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground min-w-0 gap-2 font-normal"
            aria-label={`Active Company: ${company?.name ?? "none"}. Switch Company`}
          />
        }
      >
        <Building aria-hidden="true" className="size-4 shrink-0" />
        <span className="truncate">{company?.name ?? "No Company"}</span>
        <ChevronsUpDown aria-hidden="true" className="size-3.5 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
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
