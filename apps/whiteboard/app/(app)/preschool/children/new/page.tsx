import type { Metadata } from "next";

import { AdmissionScreen } from "@/app/(app)/preschool/children/new/_components/admission-screen";

export const metadata: Metadata = { title: "Admit a Child" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ enquiryId?: string | string[] }>;
}) {
  const { enquiryId } = await searchParams;
  return (
    <AdmissionScreen
      enquiryId={typeof enquiryId === "string" ? enquiryId : undefined}
    />
  );
}
