import { Building2 } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

/**
 * Select Projects (wizard step 2). Projects arrive with M2 (CM-204); until
 * then there is nothing to pick and Team Members start with none.
 */
export function ProjectsStep() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Building2 />
        </EmptyMedia>
        <EmptyTitle>No Projects yet</EmptyTitle>
        <EmptyDescription>
          Once you add Projects, choose here which ones this Team Member works
          on. You can assign them later from Edit.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
