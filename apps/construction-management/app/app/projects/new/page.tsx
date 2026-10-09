import type { Metadata } from "next";

import { NewProjectScreen } from "@/components/projects/project-form";

export const metadata: Metadata = { title: "New Project" };

export default function NewProjectPage() {
  return <NewProjectScreen />;
}
