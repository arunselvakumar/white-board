import type { ReactNode } from "react";

import { MaterialsNav } from "@/components/procurement/materials-hub/materials-nav";

/** The Materials module of a Project (M5): its tabs, then the tab. */
export default async function MaterialsLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;
  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
      <MaterialsNav projectId={id} />
      {children}
    </div>
  );
}
