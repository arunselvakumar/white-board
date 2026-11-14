import { Skeleton } from "@repo/ui/components/skeleton";
import { SkeletonGroup, SkeletonText } from "@repo/ui/components/skeleton-kit";

import { KIND_PLURALS, KIND_ORDER } from "./check-in-format";

const WIDTHS = ["58%", "44%", "66%", "50%"];

/** One person card while it loads: avatar, two lines, room for the chip. */
function CardSkeleton({ width }: { width: string }) {
  return (
    <li className="bg-card flex min-h-16 items-center gap-3 rounded-xl border p-3">
      <Skeleton className="size-11 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <SkeletonText size="base" width={width} />
        <SkeletonText size="xs" width="70%" />
      </div>
    </li>
  );
}

/** The three groups under the search box, with their real names. */
export function CheckInPeopleSkeleton() {
  return (
    <SkeletonGroup label="Loading people" className="space-y-6">
      {KIND_ORDER.map((kind, group) => (
        <div key={kind} className="space-y-3">
          <p className="text-muted-foreground px-1 text-base font-semibold">
            {KIND_PLURALS[kind]}
          </p>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {WIDTHS.slice(0, group === 1 ? 4 : 2).map((width) => (
              <CardSkeleton key={width} width={width} />
            ))}
          </ul>
        </div>
      ))}
    </SkeletonGroup>
  );
}
