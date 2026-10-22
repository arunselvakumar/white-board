import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/ui/components/empty";

import {
  PROJECT_MODULES,
  type ProjectModuleKey,
} from "@/src/projects/domain/project-modules";

/** The Contracts modules (ADR CM-0023 §22) and the ticket that builds each. */
export const CONTRACTS_MODULE_TICKETS = {} as const satisfies Partial<
  Record<ProjectModuleKey, string>
>;

export type ContractsModuleKey = keyof typeof CONTRACTS_MODULE_TICKETS;

/**
 * Placeholder for a Contracts module whose ticket has not landed yet (M11):
 * the module's name and short description from the Project module
 * catalogue, and the ticket that brings it.
 */
export function ContractsComingSoon({
  module,
}: {
  module: ContractsModuleKey;
}) {
  const entry = PROJECT_MODULES.find((item) => item.key === module);
  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{entry?.label}</EmptyTitle>
          <EmptyDescription>
            {entry?.description} Coming in {CONTRACTS_MODULE_TICKETS[module]}.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
