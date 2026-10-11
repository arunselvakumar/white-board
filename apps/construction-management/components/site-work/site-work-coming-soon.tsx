import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/ui/components/empty";

/** Placeholder for a site-work screen whose ticket has not landed yet. */
export function SiteWorkComingSoon({
  title,
  ticket,
}: {
  title: string;
  ticket: string;
}) {
  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>Built in {ticket}.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
