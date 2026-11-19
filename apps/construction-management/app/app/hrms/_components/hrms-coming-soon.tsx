import { HourglassIcon } from "@phosphor-icons/react/ssr";

import { EmptyState } from "@repo/ui/components/empty-state";

import { hrmsPage } from "@/lib/hrms-nav";

/**
 * An HRMS screen not built yet: its title and what it will do, from
 * `lib/hrms-nav.ts`. The ticket named there (`ticket`) replaces this in the
 * page with the real screen.
 */
export function HrmsComingSoon({ href }: { href: string }) {
  const page = hrmsPage(href);
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">{page.title}</h2>
        <EmptyState
          icon={HourglassIcon}
          tone="neutral"
          title="Coming in this milestone"
          description={page.description}
          className="bg-card border"
        />
      </div>
    </div>
  );
}
