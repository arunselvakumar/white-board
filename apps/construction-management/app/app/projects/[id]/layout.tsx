import type { ReactNode } from "react";

import { ProjectShell } from "@/components/projects/project-shell";

/** The project shell around every Project page (CM-204). */
export default async function ProjectLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;
  return <ProjectShell id={id}>{children}</ProjectShell>;
}
