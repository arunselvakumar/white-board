import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

import { hrmsPage } from "@/lib/hrms-nav";

/**
 * An HRMS screen not built yet (M3): its title and what it will do, from
 * `lib/hrms-nav.ts`. The ticket named there (`ticket`) replaces this in the
 * page with the real screen.
 */
export function HrmsComingSoon({ href }: { href: string }) {
  const page = hrmsPage(href);
  const Icon = page.icon;
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">{page.title}</h2>
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Icon />
            </EmptyMedia>
            <EmptyTitle>Coming in this milestone</EmptyTitle>
            <EmptyDescription>{page.description}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </div>
  );
}
