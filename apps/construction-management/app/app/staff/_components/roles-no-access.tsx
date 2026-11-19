import { LockSimpleIcon } from "@phosphor-icons/react/ssr";
import { EmptyState } from "@repo/ui/components/empty-state";

/** A Role Management page the viewer's Role leaves out, said plainly. */
export function RolesNoAccess({ what }: { what: string }) {
  return (
    <div className="w-full max-w-4xl p-6">
      <EmptyState
        icon={LockSimpleIcon}
        tone="neutral"
        orbit={false}
        title={`You don't have access to ${what}`}
        description="Your Role does not include it. Ask the Owner if you need it."
        className="bg-card border"
      />
    </div>
  );
}
