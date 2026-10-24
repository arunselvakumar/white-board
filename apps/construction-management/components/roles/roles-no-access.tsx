import { Lock } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

/** A Role Management page the viewer's Role leaves out, said plainly. */
export function RolesNoAccess({ what }: { what: string }) {
  return (
    <div className="w-full max-w-4xl p-6">
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Lock />
          </EmptyMedia>
          <EmptyTitle>{`You don't have access to ${what}`}</EmptyTitle>
          <EmptyDescription>
            Your Role does not include it. Ask the Owner if you need it.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
