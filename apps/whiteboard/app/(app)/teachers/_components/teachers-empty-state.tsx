import Link from "next/link";
import { Button } from "@repo/ui/components/button";

export function TeachersEmptyState() {
  return (
    <div className="rounded-xl border border-dashed p-8 text-center">
      <h2 className="text-lg font-semibold">No Teachers yet</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Add a Centre Teacher or Visiting Tutor to invite them and assign
        Batches.
      </p>
      <Button className="mt-5" render={<Link href="/teachers/new" />}>
        Add Teacher
      </Button>
    </div>
  );
}
