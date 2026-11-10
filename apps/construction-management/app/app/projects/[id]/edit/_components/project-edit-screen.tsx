"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { projectQuery, projectsQuery } from "@/src/queries/projects";

import { EditProjectForm } from "./project-form";

/**
 * `/app/projects/[id]/edit`, inside the project shell. The Projects list
 * says whether the viewer has the Financial flag.
 */
export function ProjectEditScreen({ id }: { id: string }) {
  const { data: project } = useSuspenseQuery(projectQuery(id));
  const { data: list } = useSuspenseQuery(projectsQuery);
  return (
    <EditProjectForm
      key={project.updatedAt}
      project={project}
      financial={list.financial}
    />
  );
}
