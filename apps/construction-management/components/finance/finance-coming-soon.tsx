import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/ui/components/empty";

/** Placeholder for a finance screen whose ticket has not landed yet. */
export function FinanceComingSoon({
  title,
  ticket,
}: {
  title: string;
  ticket: string;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>Built in {ticket}.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
