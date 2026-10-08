"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

import { PageHeader } from "@/components/app-shell/page-header";
import { companyProfileQuery } from "@/src/queries/company-profile";

import { CompanyProfileForm } from "./company-profile-form";

/** Masters → Company profile (CM-115). */
export function CompanyProfileScreen() {
  const { data: profile } = useSuspenseQuery(companyProfileQuery);

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-8">
        <PageHeader
          back={{ label: "Masters", href: "/app/masters" }}
          title="Company profile"
          meta="How your Company appears on documents and to your team."
        />
        {profile == null ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Lock />
              </EmptyMedia>
              <EmptyTitle>You cannot see the Company profile</EmptyTitle>
              <EmptyDescription>
                Ask the Owner to allow Settings in your Permission Matrix.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <CompanyProfileForm profile={profile} />
        )}
      </div>
    </div>
  );
}
