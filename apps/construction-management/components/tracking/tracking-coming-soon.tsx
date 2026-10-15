import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/ui/components/empty";

/** Placeholder for a tracking screen whose ticket has not landed yet (M8). */
export function TrackingComingSoon({
  title,
  coming,
  ticket,
}: {
  title: string;
  /** What the screen will hold, in one sentence. */
  coming: string;
  ticket: string;
}) {
  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>
            {coming} Coming in {ticket}.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
