import type { ReactNode } from "react";

import { EquipmentNav } from "@/components/site-work/equipment/equipment-nav";

/** The Equipment module of a Project (M6): its tabs, then the tab. */
export default async function EquipmentLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;
  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
      <EquipmentNav projectId={id} />
      {children}
    </div>
  );
}
