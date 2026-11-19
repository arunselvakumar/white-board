"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { LockSimpleIcon } from "@phosphor-icons/react/ssr";
import { EmptyState } from "@repo/ui/components/empty-state";

import { PageHeader } from "@/app/app/_components/app-shell/page-header";
import { AdvancedSettings } from "@/app/app/settings/_components/advanced-settings";
import { companyProfileQuery } from "@/src/queries/company-profile";

import { CompanyProfileForm } from "./company-profile-form";

/** Settings: the Company profile, then the Advanced Settings. */
export function CompanyProfileScreen() {
  const { data: profile } = useSuspenseQuery(companyProfileQuery);

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-8">
        <PageHeader
          title="Settings"
          meta="How your Company appears on documents and to your team."
        />
        {profile == null ? (
          <EmptyState
            icon={LockSimpleIcon}
            tone="neutral"
            orbit={false}
            title="You cannot see the Company profile"
            description="Ask the Owner to allow Settings in your Permission Matrix."
            className="bg-card border"
          />
        ) : (
          <CompanyProfileForm profile={profile} />
        )}
        <div className="bg-border h-px w-full" />
        <AdvancedSettings />
      </div>
    </div>
  );
}
