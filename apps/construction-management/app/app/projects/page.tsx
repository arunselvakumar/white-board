import type { Metadata } from "next";

import { ProjectsHome } from "@/components/projects/projects-home";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return <ProjectsHome />;
}
