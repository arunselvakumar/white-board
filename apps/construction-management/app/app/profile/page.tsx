import type { Metadata } from "next";

import { MyProfileScreen } from "@/components/my-profile/my-profile-screen";

export const metadata: Metadata = { title: "My Profile" };

export default function MyProfilePage() {
  return <MyProfileScreen />;
}
