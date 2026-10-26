import { Badge } from "@repo/ui/components/badge";

type ProjectRef = { id: string; name: string };

/** "No Project", "Tower A", "Tower A, Villa" or "3 Projects" (ADR CM-0033). */
export function projectsLabel(projects: readonly ProjectRef[]): string {
  if (projects.length === 0) return "No Project";
  if (projects.length <= 2)
    return projects.map((project) => project.name).join(", ");
  return `${String(projects.length)} Projects`;
}

/**
 * A labourer's Projects in a list cell: a chip each for one or two, "3
 * Projects" with every name in its title beyond that, a dash for none.
 */
export function ProjectChips({
  projects,
}: {
  projects: readonly ProjectRef[];
}) {
  if (projects.length === 0)
    return <span className="text-muted-foreground">—</span>;
  if (projects.length > 2)
    return (
      <Badge
        variant="outline"
        title={projects.map((project) => project.name).join(", ")}
      >
        {projectsLabel(projects)}
      </Badge>
    );
  return (
    <span className="flex flex-wrap gap-1">
      {projects.map((project) => (
        <Badge key={project.id} variant="outline" className="max-w-40 truncate">
          {project.name}
        </Badge>
      ))}
    </span>
  );
}
