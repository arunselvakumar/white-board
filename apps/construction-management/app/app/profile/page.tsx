import type { Metadata } from "next";

import { MyProfileScreen } from "@/components/my-profile/my-profile-screen";
import { DevicesSection } from "@/components/profile/devices-section";
import { PrivacySection } from "@/components/profile/privacy-section";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "My Profile" };

export default function MyProfilePage() {
  return (
    <>
      <MyProfileScreen />
      {/* Account sections (M9), each loading on its own. */}
      <div className="w-full px-6 pb-6">
        <div className="w-full max-w-4xl space-y-10">
          <QuerySuspense>
            <DevicesSection />
          </QuerySuspense>
          <QuerySuspense>
            <PrivacySection />
          </QuerySuspense>
        </div>
      </div>
    </>
  );
}
