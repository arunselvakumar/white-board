"use client";

import { useActiveCompany } from "@repo/auth/construction/react";
import { useSuspenseQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/app-shell/page-header";
import { myProfileQuery } from "@/src/queries/my-profile";

import { MyProfileForm } from "./my-profile-form";

/** My Profile (CM-115), opened from the account menu. */
export function MyProfileScreen() {
  const { data: profile } = useSuspenseQuery(myProfileQuery);
  const { company } = useActiveCompany();
  const meta = [
    profile.isOwner ? "Owner" : profile.designation.name,
    company?.name,
  ]
    .filter((part) => part != null && part !== "")
    .join(" · ");

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-8">
        <PageHeader title="My Profile" meta={meta} />
        <MyProfileForm profile={profile} />
      </div>
    </div>
  );
}
