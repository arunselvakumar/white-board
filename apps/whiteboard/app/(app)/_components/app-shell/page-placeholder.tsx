import {
  Empty,
  EmptyDescription,
  EmptyHeader,
} from "@repo/ui/components/empty";
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
      <Empty className="border">
        <EmptyHeader>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
