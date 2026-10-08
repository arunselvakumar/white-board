import type { LucideIcon } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

/** A titled page with nothing in it yet. */
export function PagePlaceholder({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <Empty className="border">
        <EmptyHeader>
          {Icon == null ? null : (
            <EmptyMedia variant="icon">
              <Icon />
            </EmptyMedia>
          )}
          <EmptyTitle>Nothing here yet</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
