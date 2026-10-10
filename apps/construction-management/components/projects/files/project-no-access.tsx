import { Lock } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

/**
 * A Project section the member's Permission Matrix leaves out (no Read on
 * its menu): said plainly instead of a failed request.
 */
export function ProjectNoAccess({ what }: { what: string }) {
  return (
    <div className="w-full max-w-5xl p-6">
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Lock />
          </EmptyMedia>
          <EmptyTitle>{`You don't have access to ${what}`}</EmptyTitle>
          <EmptyDescription>
            Your Permission Matrix does not include it. Ask the Owner if you
            need it.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
