import { ChalkboardTeacherIcon } from "@phosphor-icons/react/ssr";
import { EmptyState } from "@repo/ui/components/empty-state";
import Link from "next/link";
import { Button } from "@repo/ui/components/button";

export function TeachersEmptyState() {
  return (
    <EmptyState
      className="border"
      icon={ChalkboardTeacherIcon}
      tone="violet"
      title={<h2>No Teachers yet</h2>}
      description="Add a Centre Teacher or Visiting Tutor to invite them and assign Batches."
      actions={
        <Button render={<Link href="/teachers/new" />}>Add Teacher</Button>
      }
    />
  );
}
