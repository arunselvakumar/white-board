import { HourglassIcon } from "@phosphor-icons/react/ssr";

import { EmptyState } from "@repo/ui/components/empty-state";
import { PageWatermark } from "@repo/ui/components/page-watermark";

/** A titled page with nothing in it yet. */
export function PagePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
      <div className="relative">
        <PageWatermark text={title} />
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      <EmptyState
        icon={HourglassIcon}
        tone="neutral"
        title="Nothing here yet"
        description={description}
        className="bg-card border"
      />
    </div>
  );
}
