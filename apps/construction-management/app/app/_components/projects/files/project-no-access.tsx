import { LockSimpleIcon } from "@phosphor-icons/react/ssr";
import { EmptyState } from "@repo/ui/components/empty-state";

/**
 * A Project section the member's Permission Matrix leaves out (no Read on
 * its menu): said plainly instead of a failed request.
 */
export function ProjectNoAccess({ what }: { what: string }) {
  return (
    <div className="w-full max-w-5xl p-6">
      <EmptyState
        className="bg-card border"
        icon={LockSimpleIcon}
        tone="neutral"
        orbit={false}
        title={`You don't have access to ${what}`}
        description="Your Permission Matrix does not include it. Ask the Owner if you need it."
      />
    </div>
  );
}
