import { PageHeader } from "@/app/app/_components/app-shell/page-header";
import { MenuCard } from "@/app/app/_components/app-shell/menu-card";
import type { DepartmentCardGroup } from "@/lib/departments-nav";

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/**
 * A page of cards (ADR CM-0046): Departments, or one department's
 * screens. Each group is a heading over a grid of cards, one per screen;
 * every card opens its screen. The page shows what the viewer's Role
 * opens, the same as the sidebar.
 */
export function DepartmentPage({
  title,
  meta,
  groups,
}: {
  title: string;
  meta: string;
  groups: readonly DepartmentCardGroup[];
}) {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-6xl space-y-8">
        <PageHeader title={title} meta={meta} />
        {groups.map((group) => {
          const headingId = `department-group-${slug(group.label ?? title)}`;
          return (
            <section
              key={group.label ?? title}
              aria-labelledby={group.label == null ? undefined : headingId}
              aria-label={group.label == null ? title : undefined}
              className="space-y-3"
            >
              {group.label == null ? null : (
                <h2
                  id={headingId}
                  className="text-muted-foreground text-sm font-semibold"
                >
                  {group.label}
                </h2>
              )}
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {group.sections.map((card) => (
                  <li key={card.href} className="flex">
                    <MenuCard
                      href={card.href}
                      label={card.label}
                      description={card.description}
                      icon={card.icon}
                    />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
