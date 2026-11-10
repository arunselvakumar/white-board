import type { Metadata } from "next";

import { MyProfileScreen } from "@/app/app/profile/_components/my-profile/my-profile-screen";
import { DevicesSection } from "@/app/app/profile/_components/devices-section";
import { PrivacySection } from "@/app/app/profile/_components/privacy-section";
import {
  DevicesSectionSkeleton,
  MyProfileSkeleton,
  PrivacySectionSkeleton,
} from "@/app/app/profile/_components/profile-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "My Profile" };

export default function MyProfilePage() {
  return (
    <>
      <QuerySuspense fallback={<MyProfileSkeleton />}>
        <MyProfileScreen />
      </QuerySuspense>
      {/* Account sections, each loading on its own. */}
      <div className="w-full px-6 pb-6">
        <div className="w-full max-w-4xl space-y-10">
          <QuerySuspense fallback={<DevicesSectionSkeleton />}>
            <DevicesSection />
          </QuerySuspense>
          <QuerySuspense fallback={<PrivacySectionSkeleton />}>
            <PrivacySection />
          </QuerySuspense>
        </div>
      </div>
    </>
  );
}
