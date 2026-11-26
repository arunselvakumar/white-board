import type { Metadata } from "next";

import { ChildScreen } from "@/app/(app)/preschool/children/[id]/_components/child-screen";

export const metadata: Metadata = { title: "Child" };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ageWarning?: string | string[] }>;
}) {
  const [{ id }, { ageWarning }] = await Promise.all([params, searchParams]);
  return (
    <ChildScreen
      childId={id}
      ageWarning={typeof ageWarning === "string" ? ageWarning : null}
    />
  );
}
