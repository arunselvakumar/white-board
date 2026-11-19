import { HourglassIcon } from "@phosphor-icons/react/ssr";
import { EmptyState } from "@repo/ui/components/empty-state";
import { PageWatermark } from "@repo/ui/components/page-watermark";

export function PagePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-6 pt-6 pb-2">
        <div className="relative">
          <PageWatermark text={title} />
          <h1 className="text-2xl tracking-tight">{title}</h1>
        </div>
      </div>
      <EmptyState
        className="border"
        icon={HourglassIcon}
        tone="neutral"
        title="Nothing here yet"
        description={description}
      />
    </div>
  );
}
