"use client";

import { useCompanyList } from "@repo/auth/construction/react";
import { Building, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/item";

import { AuthHeading } from "@/components/auth/auth-heading";
import { FormAlert } from "@/components/auth/form-alert";
import { authErrorMessage } from "@/lib/auth-errors";
import { safeAppPath } from "@/lib/safe-redirect";

const ROLE_LABEL = { owner: "Owner", member: "Team Member" } as const;

/** Your Companies, and creating another one (CM-103; join requests: CM-109). */
export function ChooseCompanyForm({
  redirectUrl,
  joinRequests,
}: {
  redirectUrl: string | null;
  joinRequests?: React.ReactNode;
}) {
  const { companies, setActive, fetchStatus, error } = useCompanyList();
  const [choosing, setChoosing] = useState<string | null>(null);
  const target = safeAppPath(redirectUrl);

  return (
    <>
      <AuthHeading
        title={companies.length === 0 ? "Get started" : "Choose a Company"}
        description={
          companies.length === 0
            ? "Create your Company, or accept a Join Request from one."
            : "Pick the Company you want to work in. You can switch any time."
        }
      />
      {companies.length > 0 && (
        <section aria-labelledby="your-companies" className="space-y-3">
          <h2
            id="your-companies"
            className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase"
          >
            Your Companies
          </h2>
          <ItemGroup className="gap-2">
            {companies.map((company) => (
              <Item key={company.id} variant="outline" role="listitem">
                <ItemMedia variant="icon">
                  <Building />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{company.name}</ItemTitle>
                  <ItemDescription>{ROLE_LABEL[company.role]}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    size="sm"
                    aria-label={`Open ${company.name}`}
                    disabled={fetchStatus === "fetching"}
                    onClick={() => {
                      setChoosing(company.id);
                      void setActive(company.id, target);
                    }}
                  >
                    {choosing === company.id && fetchStatus === "fetching"
                      ? "Opening…"
                      : "Open"}
                    <ChevronRight />
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        </section>
      )}
      {joinRequests}
      <FormAlert message={authErrorMessage(error, "global")} />
      <Link
        href="/create-company"
        className={buttonVariants({
          variant: companies.length === 0 ? "default" : "outline",
          className: "h-10 w-full",
        })}
      >
        <Plus />
        Create a Company
      </Link>
    </>
  );
}
