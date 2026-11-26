import type { Metadata } from "next";

import { EnquiriesScreen } from "@/app/(app)/preschool/enquiries/_components/enquiries-screen";

export const metadata: Metadata = { title: "Enquiries" };

export default function Page() {
  return <EnquiriesScreen />;
}
